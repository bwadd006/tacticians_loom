import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { REFERENCE_SCHEMA_VERSION, ROUTES, STATS } from '../src/shared/catalog';
import { validateSources } from '../src/shared/validate_sources';
import { getCharacter, getClass, getOverview, listCharacters } from '../src/main/database/reference_queries';

export function validateDatabase(db: Database.Database) {
  assert.equal(db.pragma('user_version', { simple: true }), REFERENCE_SCHEMA_VERSION);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  const sourceRows = db.prepare('SELECT kind, sha256, raw_json FROM source_documents').all() as { kind: string; sha256: string; raw_json: string }[];
  const docs = Object.fromEntries(sourceRows.map(row => {
    assert.equal(createHash('sha256').update(row.raw_json).digest('hex'), row.sha256);
    return [row.kind, JSON.parse(row.raw_json)];
  }));
  const { characters, classes } = validateSources(docs.characters, docs.classes);
  const count = (table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
  assert.equal(count('characters'), characters.characters.length);
  assert.equal(count('classes'), classes.classes.length);
  assert.equal(count('recruitment'), characters.characters.length * ROUTES.length);
  assert.equal(count('character_growths'), characters.characters.length * STATS.length);
  assert.equal(count('class_growths'), classes.classes.length * STATS.length);
  assert.equal(count('personal_abilities'), characters.characters.reduce((n, c) => n + c.personal_abilities.length, 0));
  assert.equal(count('route_unlocks'), classes.route_unlocks.length);
  assert.equal(count('data_conflicts'), characters.data_conflicts.length + classes.data_conflicts.length);
  assert.equal(count('recruitment_requirements'), characters.characters.reduce((n, c) => n + Object.values(c.recruitment_by_route).reduce((sum, r) => sum + r.requirements.length, 0), 0));
  const growth = db.prepare('SELECT personal, effective_personal FROM character_growths WHERE character_id = ? AND stat_id = ?');
  const classGrowth = db.prepare('SELECT modifier FROM class_growths WHERE class_id = ? AND stat_id = ?');
  for (const c of characters.characters) {
    assert.deepEqual(getCharacter(db, c.id), c);
    for (const stat of STATS) assert.deepEqual(growth.get(c.id, stat), { personal: c.growth_rates_percent[stat], effective_personal: c.effective_personal_growth_rates_percent?.[stat] ?? null });
  }
  for (const c of classes.classes) {
    assert.deepEqual(getClass(db, c.id), c);
    for (const stat of STATS) assert.deepEqual(classGrowth.get(c.id, stat), { modifier: c.class_growth_rate_modifiers_percent[stat] });
  }
  for (const route of ROUTES) assert.equal(listCharacters(db, route).length, characters.metadata.part_1_recruitment_records_by_route[route]);
  assert.equal(listCharacters(db, 'all').length, characters.characters.filter(c => c.flags.recruitable_or_joins_in_part_1).length);
  return { validation: 'passed', overview: getOverview(db) };
}
