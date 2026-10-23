import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { buildDatabase } from '../scripts/database_builder';
import { validateDatabase } from '../scripts/database_validation';
import { ROUTES, STATS } from '../src/shared/catalog';
import { validateSources } from '../src/shared/validate_sources';
import { getCharacter, getClass, getClassLibrary, listCharacters, metadata, openReference } from '../src/main/database/reference_queries';

const appRoot = process.cwd();
const characters = JSON.parse(fs.readFileSync(path.join(appRoot, 'data/source/fire_emblem_fortunes_weave_characters.json'), 'utf8'));
const classes = JSON.parse(fs.readFileSync(path.join(appRoot, 'data/source/fire_emblem_fortunes_weave_classes.json'), 'utf8'));
let temporary: string;
let database: Database.Database;
before(() => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tacticians_loom_test_'));
  const file = path.join(temporary, 'reference.sqlite');
  buildDatabase(appRoot, file);
  database = openReference(file);
});
after(() => { database?.close(); if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); });

test('every entity round-trips, database integrity and source counts match', () => {
  assert.equal(validateDatabase(database).validation, 'passed');
  for (const c of characters.characters) assert.deepEqual(getCharacter(database, c.id), c);
  for (const c of classes.classes) assert.deepEqual(getClass(database, c.id), c);
});

test('Class Library query returns all tier rules, unlock evidence and maintenance uncertainty', () => {
  const library = getClassLibrary(database);
  assert.equal(library.classes.length, 60);
  assert.deepEqual(Object.keys(library.certificationRules).sort(), ['advanced', 'beginner', 'divine', 'master', 'specialty', 'unique']);
  assert.equal(library.unlocks.length, 19);
  assert.equal(library.restrictions.verified, false);
  assert.ok(library.restrictions.note.includes('unverified'));
  assert.equal(library.conflicts.length, 6);
  assert.deepEqual(library.classes.slice(0, 2).map(characterClass => characterClass.tier), ['unique', 'unique']);
});

test('All Routes is the distinct Act 1 union; route queries retain all four availability records', () => {
  const all = listCharacters(database, 'all');
  const union = new Set(ROUTES.flatMap(r => listCharacters(database, r).map(c => c.id)));
  assert.deepEqual(new Set(all.map(c => c.id)), union);
  assert.equal(all.length, union.size);
  assert.ok(all.every(c => ROUTES.every(r => c.recruitment_by_route[r])));
  const sortedNames = [...all].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).map(c => c.id);
  assert.deepEqual(all.map(c => c.id), sortedNames);
  assert.throws(() => listCharacters(database, 'invalid' as 'all'), /Unknown route/);
});

test('unknown growths, thresholds and proficiencies remain distinct from zero and empty', () => {
  assert.equal(getClass(database, 'dancer')!.class_growth_rate_modifiers_percent.hp, null);
  assert.equal(getClass(database, 'commoner')!.class_growth_rate_modifiers_percent.hp, 0);
  const unknown = characters.characters.find((c: { skill_proficiencies: { boons: unknown } }) => c.skill_proficiencies.boons === null);
  assert.equal(getCharacter(database, unknown.id)!.skill_proficiencies.boons, null);
  assert.deepEqual(database.prepare('SELECT boons_known, banes_known FROM characters WHERE id = ?').get(unknown.id), { boons_known: 0, banes_known: 0 });
  const c = getCharacter(database, unknown.id)!;
  assert.equal(c.recruitment_by_route.cai.status, 'not_available_in_part_1_recruitment_table');
  assert.equal(c.recruitment_by_route.cai.min_renown, null);
});

test('personal adjustments, class growth, training, weapon access and mastery stay separate', () => {
  const mu = getCharacter(database, 'mu')!;
  assert.notDeepEqual(mu.growth_rates_percent, mu.effective_personal_growth_rates_percent);
  const commoner = getClass(database, 'commoner')!;
  assert.deepEqual(commoner.skills_listed_without_exp_bonus, ['any_weapon']);
  assert.equal(commoner.weapon_access.usable_weapon_types, null);
  assert.deepEqual(commoner.active_class_abilities, []);
  assert.equal(commoner.mastery.ability_name, 'Combat Basics');
  assert.equal(commoner.mastery.class_exp_required, null);
  assert.equal(getClass(database, 'gladiator')!.certification.exact_minimum_level, null);
});

test('reviewed post-release class facts stay attached to their stable class IDs', () => {
  const orniusRider = getClass(database, 'ornius-rider')!;
  assert.equal(orniusRider.weapon_access.verified, true);
  assert.deepEqual(orniusRider.weapon_access.usable_weapon_types, ['swords', 'spears', 'axes']);
  assert.deepEqual(orniusRider.weapon_access.usable_magic_types, []);
  assert.equal(orniusRider.base_stat_modifiers?.speed, 3);

  const diviner = getClass(database, 'diviner')!;
  assert.equal(diviner.weapon_access.verified, true);
  assert.deepEqual(diviner.weapon_access.usable_weapon_types, ['swords', 'axes', 'gauntlets']);
  assert.deepEqual(diviner.weapon_access.usable_magic_types, ['black_magic', 'white_magic']);
  assert.equal(diviner.base_stat_modifiers?.magic, 1);
  const specialtyAccess = new Map([
    ['myrmidon', [['swords', 'spears'], []]],
    ['brigand', [['swords', 'axes', 'gauntlets'], []]],
    ['pugilist', [['gauntlets'], []]],
    ['archer', [['bows'], []]],
    ['rogue', [['swords', 'bows'], []]],
    ['armored-knight', [['swords', 'spears', 'axes'], []]],
    ['light-cavalry', [['swords', 'spears', 'axes'], []]],
    ['charioteer', [['bows'], []]],
    ['armored-ornius-rider', [['swords', 'spears', 'axes'], []]],
    ['wing-soldier', [['swords', 'spears'], []]],
    ['shaman', [['swords', 'gauntlets'], ['black_magic', 'white_magic']]],
    ['priest', [['axes', 'gauntlets'], ['black_magic', 'white_magic']]],
  ]);
  for (const [classId, [weapons, magic]] of specialtyAccess) {
    const specialtyClass = getClass(database, classId)!;
    assert.equal(specialtyClass.weapon_access.verified, true, classId);
    assert.deepEqual(specialtyClass.weapon_access.usable_weapon_types, weapons, classId);
    assert.deepEqual(specialtyClass.weapon_access.usable_magic_types, magic, classId);
    assert.notEqual(specialtyClass.base_stat_modifiers, null, classId);
  }
  assert.deepEqual(getClass(database, 'wing-soldier')!.known_character_restrictions?.[0]?.allowed_values, ['female']);
  assert.equal(getClass(database, 'commoner')!.weapon_access.verified, false);
  assert.equal(getClass(database, 'noble')!.base_stat_modifiers, null);
});

test('conflicts, ranked abilities, requirements and conventional stat order are preserved', () => {
  const conflict = database.prepare("SELECT raw_json FROM data_conflicts WHERE character_id = 'nezha'").get() as { raw_json: string };
  assert.deepEqual(JSON.parse(conflict.raw_json), characters.data_conflicts.find((c: { character_id: string }) => c.character_id === 'nezha'));
  assert.equal(getCharacter(database, 'alexandra')!.personal_abilities[2].upgrade_of, 'Soar');
  assert.deepEqual((database.prepare('SELECT id FROM stats ORDER BY display_order').all() as { id: string }[]).map(r => r.id), [...STATS]);
  assert.equal(STATS[3], 'dexterity');
});

test('reference is read-only and IDs cannot inject SQL', () => {
  assert.throws(() => database.prepare("DELETE FROM characters WHERE id = 'mu'").run(), /readonly/);
  assert.equal(getCharacter(database, "' OR 1=1 --"), null);
  assert.equal(getClass(database, 'missing'), null);
});

test('normalized growth and recruitment tables support a strong-and-fast route query', () => {
  const rows = database.prepare(`
    SELECT c.id FROM characters c
    JOIN recruitment r ON r.character_id = c.id
    JOIN character_growths strength ON strength.character_id = c.id AND strength.stat_id = 'strength'
    JOIN character_growths speed ON speed.character_id = c.id AND speed.stat_id = 'speed'
    WHERE r.route_id = ? AND r.status IN ('recruitable','automatic','mandatory_tutorial')
      AND strength.personal >= ? AND speed.personal >= ?
    ORDER BY strength.personal DESC, speed.personal DESC, c.name COLLATE NOCASE, c.id
  `).all('cai', 40, 35) as { id: string }[];
  const expected = listCharacters(database, 'cai')
    .filter(c => c.growth_rates_percent.strength !== null && c.growth_rates_percent.strength >= 40 && c.growth_rates_percent.speed !== null && c.growth_rates_percent.speed >= 35)
    .sort((a, b) => b.growth_rates_percent.strength! - a.growth_rates_percent.strength! || b.growth_rates_percent.speed! - a.growth_rates_percent.speed! || a.name.localeCompare(b.name));
  assert.ok(expected.length > 0);
  assert.deepEqual(rows.map(r => r.id), expected.map(c => c.id));
});

test('import rejects duplicate IDs, missing routes/stats, invalid types and dangling links', () => {
  const duplicate = structuredClone(characters); duplicate.characters[1].id = duplicate.characters[0].id;
  assert.throws(() => validateSources(duplicate, classes), /Duplicate character/);
  const missing = structuredClone(characters); delete missing.characters[0].growth_rates_percent.hp;
  assert.throws(() => validateSources(missing, classes));
  const route = structuredClone(characters); delete route.characters[0].recruitment_by_route.leda;
  assert.throws(() => validateSources(route, classes));
  const type = structuredClone(characters); type.characters[0].growth_rates_percent.hp = '30';
  assert.throws(() => validateSources(type, classes));
  const link = structuredClone(classes); link.route_unlocks[0].unlock_class_ids.push('missing_class');
  assert.throws(() => validateSources(characters, link), /unknown class/);
});

test('failed candidate preserves prior database and cleans up; corrected version rebuilds with a change report', () => {
  const fixture = path.join(temporary, 'fixture');
  fs.mkdirSync(path.join(fixture, 'database'), { recursive: true });
  fs.cpSync(path.join(appRoot, 'data'), path.join(fixture, 'data'), { recursive: true });
  fs.copyFileSync(path.join(appRoot, 'database/reference_schema.sql'), path.join(fixture, 'database/reference_schema.sql'));
  const result = buildDatabase(fixture);
  const initial = fs.readFileSync(result.outputFile);
  const sourceFile = path.join(fixture, 'data/source/fire_emblem_fortunes_weave_classes.json');
  const manifestFile = path.join(fixture, 'data/dataset_manifest.json');
  const changed = structuredClone(classes);
  changed.classes[0].name = 'Reviewed Commoner';
  fs.writeFileSync(sourceFile, JSON.stringify(changed));
  assert.throws(() => buildDatabase(fixture), /bump dataset_version/);
  assert.deepEqual(fs.readFileSync(result.outputFile), initial);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.dataset_version += '.test'; manifest.change_summary = 'Test correction';
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  // Deliberate SQL uniqueness failure after the candidate is created.
  changed.classes[0].movement_tags.push(changed.classes[0].movement_tags[0]);
  fs.writeFileSync(sourceFile, JSON.stringify(changed));
  assert.throws(() => buildDatabase(fixture), /UNIQUE/);
  assert.deepEqual(fs.readFileSync(result.outputFile), initial);
  assert.deepEqual(fs.readdirSync(path.dirname(result.outputFile)), ['reference.sqlite']);
  changed.classes[0].movement_tags.pop();
  fs.writeFileSync(sourceFile, JSON.stringify(changed));
  buildDatabase(fixture);
  const updated = openReference(result.outputFile);
  try {
    assert.equal(getClass(updated, 'commoner')!.name, 'Reviewed Commoner');
    const report = metadata(updated, 'change_report') as { classes: { changed: string[] } };
    assert.deepEqual(report.classes.changed, ['commoner']);
  } finally { updated.close(); }
});
