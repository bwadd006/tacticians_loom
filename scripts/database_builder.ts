import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type Database from 'better-sqlite3';
import { IMPORTER_VERSION, REFERENCE_SCHEMA_VERSION, ROUTES, ROUTE_NAMES, SKILLS, STATS } from '../src/shared/catalog';
import { datasetManifestSchema } from '../src/shared/source_models';
import { validateSources } from '../src/shared/validate_sources';
import { loadSqlite } from '../src/main/database/sqlite';
import { metadata } from '../src/main/database/reference_queries';
import { validateDatabase } from './database_validation';

const json = (value: unknown) => JSON.stringify(value);
const boolean = (value: boolean | null) => value === null ? null : Number(value);
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export function buildDatabase(appRoot: string, outputFile = path.join(appRoot, 'database/generated/reference.sqlite')) {
  const manifest = datasetManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(appRoot, 'data/dataset_manifest.json'), 'utf8')));
  const characterText = fs.readFileSync(path.join(appRoot, 'data/source', manifest.source_files.characters), 'utf8');
  const classText = fs.readFileSync(path.join(appRoot, 'data/source', manifest.source_files.classes), 'utf8');
  const paralogueText = fs.readFileSync(path.join(appRoot, 'data/source', manifest.source_files.paralogues), 'utf8');
  const { characters, classes, paralogues } = validateSources(JSON.parse(characterText), JSON.parse(classText), JSON.parse(paralogueText));
  const hashes = { characters: hash(characterText), classes: hash(classText), paralogues: hash(paralogueText) };
  const Sqlite = loadSqlite();
  let previous: Record<string, unknown> | undefined;
  if (fs.existsSync(outputFile)) {
    const old = new Sqlite(outputFile, { readonly: true });
    try {
      if (metadata(old, 'dataset_version') === manifest.dataset_version && json(metadata(old, 'source_hashes')) !== json(hashes)) {
        throw new Error('Source data changed: bump dataset_version and update change_summary before rebuilding');
      }
      previous = Object.fromEntries((old.prepare('SELECT kind, raw_json FROM source_documents').all() as { kind: string; raw_json: string }[]).map(r => [r.kind, JSON.parse(r.raw_json)]));
    } finally { old.close(); }
  }
  const changeReport = compareSources(previous, { characters, classes, paralogues });
  const schema = fs.readFileSync(path.join(appRoot, 'database/reference_schema.sql'), 'utf8');
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const candidate = `${outputFile}.${randomUUID()}.tmp`;
  let db: Database.Database | undefined;
  try {
    db = new Sqlite(candidate);
    db.exec(schema);
    const database = db;
    // Table names and column sets are internal constants, never renderer input.
    const statements = new Map<string, Database.Statement>();
    function insert(table: string, ...values: (string | number | null)[]) {
      let statement = statements.get(table);
      if (!statement) {
        statement = database.prepare(`INSERT INTO ${table} VALUES (${values.map(() => '?').join(',')})`);
        statements.set(table, statement);
      }
      statement.run(...values);
    }
    database.transaction(() => {
      const buildMetadata = {
        dataset_version: manifest.dataset_version, change_summary: manifest.change_summary,
        reference_schema_version: REFERENCE_SCHEMA_VERSION, importer_version: IMPORTER_VERSION,
        source_hashes: hashes, schema_sha256: hash(schema), built_at: new Date().toISOString(),
        change_report: changeReport,
      };
      for (const [key, value] of Object.entries(buildMetadata)) insert('build_metadata', key, json(value));
      insert('source_documents', 'characters', manifest.source_files.characters, hashes.characters, characters.metadata.schema_version, characterText);
      insert('source_documents', 'classes', manifest.source_files.classes, hashes.classes, classes.metadata.schema_version, classText);
      insert('source_documents', 'paralogues', manifest.source_files.paralogues, hashes.paralogues, paralogues.metadata.schema_version, paralogueText);
      ROUTES.forEach(id => insert('routes', id, ROUTE_NAMES[id], 1));
      STATS.forEach((id, index) => insert('stats', id, index));
      SKILLS.forEach(id => insert('skills', id));
      for (const [id, rule] of Object.entries(classes.certification_rules)) insert('certification_tiers', id, json(rule));
      for (const c of classes.classes) {
        insert('classes', c.id, c.name, c.tier, Number(c.playable), json(c));
        for (const stat of STATS) insert('class_growths', c.id, stat, c.class_growth_rate_modifiers_percent[stat]);
        for (const [skill, bonus] of Object.entries(c.skill_exp_bonuses)) insert('class_training', c.id, skill, bonus!);
        for (const tag of c.movement_tags) insert('class_movement_tags', c.id, tag);
        c.active_class_abilities.forEach((a, i) => insert('class_active_abilities', c.id, i, a.name, a.effect, json(a)));
        const m = c.mastery;
        insert('class_mastery', c.id, m.ability_name, m.effect, m.class_exp_required, boolean(m.retained_on_reclass), json(m));
        const cert = c.certification;
        insert('class_certification', c.id, cert.tier_rule_id, cert.exact_minimum_level, Number(cert.skill_rule_is_complete), json(cert));
        for (const grade of cert.recommended_skill_grades ?? []) insert('class_recommended_grades', c.id, grade.skill_id, grade.grade);
      }
      for (const c of characters.characters) {
        const p = c.skill_proficiencies;
        insert('characters', c.id, c.name, c.availability_category, c.starting_level, c.starting_class, Number(p.boons !== null), Number(p.banes !== null), Number(p.verified), json(c));
        for (const stat of STATS) insert('character_growths', c.id, stat, c.growth_rates_percent[stat], c.effective_personal_growth_rates_percent?.[stat] ?? null);
        for (const s of p.boons ?? []) insert('character_affinities', c.id, s, 'boon');
        for (const s of p.banes ?? []) insert('character_affinities', c.id, s, 'bane');
        c.personal_abilities.forEach((a, i) => insert('personal_abilities', c.id, i, a.name, a.effect, a.rank, a.acquisition.type, a.acquisition.level, a.upgrade_of ?? null, a.source, json(a)));
        for (const route of ROUTES) {
          const r = c.recruitment_by_route[route];
          insert('recruitment', c.id, route, r.status, r.earliest_chapter, r.min_renown, r.min_support, boolean(r.missable), r.source, json(r));
          r.requirements.forEach((requirement, i) => insert('recruitment_requirements', c.id, route, i, requirement.type, json(requirement)));
        }
      }
      for (const u of classes.route_unlocks) {
        insert('route_unlocks', u.id, u.route_id, u.part, u.earliest_chapter, json(u));
        for (const classId of u.unlock_class_ids) insert('class_unlocks', classId, u.id);
      }
      for (const paralogue of paralogues.paralogues) {
        insert('paralogues', paralogue.id, paralogue.name, paralogue.associated_character_name, paralogue.associated_character_id, paralogue.verification_status, json(paralogue));
        for (const route of ROUTES) {
          const availability = paralogue.route_availability[route];
          insert('paralogue_availability', paralogue.id, route, availability.status, availability.earliest_chapter,
            availability.listed_completion_deadline?.month ?? null, availability.listed_completion_deadline?.day ?? null,
            availability.effective_completion_deadline?.month ?? null, availability.effective_completion_deadline?.day ?? null,
            availability.forced_start_date?.month ?? null, availability.forced_start_date?.day ?? null,
            boolean(availability.missable), availability.verification_status, json(availability));
          availability.acceptance_windows.forEach((window, index) => insert('paralogue_acceptance_windows', paralogue.id, route, index,
            window.start?.month ?? null, window.start?.day ?? null, window.end?.month ?? null, window.end?.day ?? null, json(window)));
        }
      }
      // All canonical paralogues exist before prerequisite foreign keys are inserted.
      for (const paralogue of paralogues.paralogues) {
        paralogue.requirements.forEach((requirement, index) => {
          insert('paralogue_requirements', paralogue.id, index, requirement.type, requirement.character_id, requirement.paralogue_id, json(requirement));
          requirement.route_ids.forEach(route => insert('paralogue_requirement_routes', paralogue.id, index, route));
        });
        paralogue.outcomes.forEach((outcome, index) => {
          insert('paralogue_outcomes', paralogue.id, index, outcome.type, outcome.character_id, outcome.class_id, outcome.name, outcome.quantity, outcome.verification_status, json(outcome));
          outcome.route_ids.forEach(route => insert('paralogue_outcome_routes', paralogue.id, index, route));
        });
      }
      for (const [kind, doc] of Object.entries({ characters, classes, paralogues })) {
        doc.sources.forEach((s, i) => insert('source_references', kind, i, s.name, s.url, json(s)));
        doc.data_conflicts.forEach((c, i) => insert('data_conflicts', kind, i,
          'character_id' in c && typeof c.character_id === 'string' ? c.character_id : null,
          'class_id' in c && typeof c.class_id === 'string' ? c.class_id : null,
          'paralogue_id' in c && typeof c.paralogue_id === 'string' ? c.paralogue_id : null,
          c.field, c.status, json(c)));
      }
    })();
    const report = validateDatabase(database);
    database.prepare('INSERT INTO build_metadata VALUES (?, ?)').run('validation', json('passed'));
    database.close(); db = undefined;
    // Closed candidate, same filesystem: failure above leaves the previous database untouched.
    fs.renameSync(candidate, outputFile);
    return { outputFile, datasetVersion: manifest.dataset_version, ...report, changes: changeReport };
  } finally {
    db?.close();
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  }
}

function compareSources(previous: Record<string, unknown> | undefined, next: Record<string, unknown>) {
  const report: Record<string, unknown> = {};
  for (const kind of ['characters', 'classes', 'paralogues']) {
    const oldDoc = previous?.[kind] as Record<string, unknown> | undefined;
    const newDoc = next[kind] as Record<string, unknown>;
    const oldRows = new Map(((oldDoc?.[kind] ?? []) as { id: string }[]).map(r => [r.id, r]));
    const newRows = new Map((newDoc[kind] as { id: string }[]).map(r => [r.id, r]));
    report[kind] = {
      added: [...newRows.keys()].filter(id => !oldRows.has(id)),
      removed: [...oldRows.keys()].filter(id => !newRows.has(id)),
      changed: [...newRows.keys()].filter(id => oldRows.has(id) && !isDeepStrictEqual(oldRows.get(id), newRows.get(id))),
      changedSections: Object.keys(newDoc).filter(key => key !== kind && !isDeepStrictEqual(oldDoc?.[key], newDoc[key])),
    };
  }
  return report;
}
