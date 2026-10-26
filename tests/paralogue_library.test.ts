import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROUTES } from '../src/shared/catalog';
import { paraloguesDocumentSchema, type Paralogue } from '../src/shared/source_models';
import { queryParalogueLibrary } from '../src/shared/paralogue_library_query';
import { applyParalogueColumnSort, defaultParalogueSetup, paralogueRouteSortField, paralogueSetupSchema, type ParalogueLibrarySetup } from '../src/shared/paralogue_library_setup';
import { loadParalogueSetup, openUserDatabase, saveParalogueSetup } from '../src/main/database/user_database';
import { loadSqlite } from '../src/main/database/sqlite';
import { buildDataCoverageReport } from '../src/shared/data_coverage';
import { charactersDocumentSchema, classesDocumentSchema } from '../src/shared/source_models';

const document = paraloguesDocumentSchema.parse(JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/source/fire_emblem_fortunes_weave_paralogues.json'), 'utf8')));
const paralogues = document.paralogues;
const characterDocument = charactersDocumentSchema.parse(JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/source/fire_emblem_fortunes_weave_characters.json'), 'utf8')));
const classDocument = classesDocumentSchema.parse(JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/source/fire_emblem_fortunes_weave_classes.json'), 'utf8')));
const characterIds = new Set(paralogues.flatMap(paralogue => [paralogue.associated_character_id, ...paralogue.requirements.map(requirement => requirement.character_id)]).filter((value): value is string => value !== null));
const ids = (rows: Paralogue[]) => rows.map(row => row.id);

test('catalog has nine canonical paralogues and the reviewed four-route totals', () => {
  assert.equal(paralogues.length, 9);
  assert.deepEqual(Object.fromEntries(ROUTES.map(route => [route, paralogues.filter(paralogue => paralogue.route_availability[route].status === 'available').length])), { cai: 4, dietrich: 8, theodora: 7, leda: 4 });
  assert.ok(paralogues.every(paralogue => ROUTES.every(route => paralogue.route_availability[route])));
  assert.equal(paralogues.find(paralogue => paralogue.id === 'golden-secret')?.associated_character_id, null);
});

test('maintenance coverage reports the paralogue dataset and provenance', () => {
  const report = buildDataCoverageReport(characterDocument, classDocument, document);
  assert.equal(report.paralogues.records, 9);
  assert.equal(report.paralogues.route_records, 36);
  assert.equal(report.paralogues.available_route_records, 23);
  assert.equal(report.provenance.paralogue_conflicts, 7);
});

test('default query is alphabetical and route scope always applies outside any-mode rules', () => {
  const rows = queryParalogueLibrary(paralogues, defaultParalogueSetup(), characterIds);
  assert.deepEqual(ids(rows), [...ids(rows)].sort((a, b) => paralogues.find(value => value.id === a)!.name.localeCompare(paralogues.find(value => value.id === b)!.name, 'en')));
  const scoped: ParalogueLibrarySetup = { ...defaultParalogueSetup(), route: 'leda', mode: 'any', filters: [{ kind: 'availability', route: 'cai', status: 'available' }] };
  const matches = queryParalogueLibrary(paralogues, scoped, characterIds);
  assert.ok(matches.length > 0);
  assert.ok(matches.every(paralogue => paralogue.route_availability.leda.status === 'available' && paralogue.route_availability.cai.status === 'available'));
});

test('timing, requirement, outcome, search, and unknown-aware filters use structured facts', () => {
  const query = (setup: Partial<ParalogueLibrarySetup>) => queryParalogueLibrary(paralogues, { ...defaultParalogueSetup(), ...setup }, characterIds);
  assert.deepEqual(ids(query({ filters: [{ kind: 'timing', state: 'multiple_windows' }] })), ['secret-of-the-vanished-carriage']);
  assert.deepEqual(ids(query({ filters: [{ kind: 'timing', state: 'forced_start' }] })).sort(), ['diversionary-tactics', 'great-escape']);
  assert.ok(query({ filters: [{ kind: 'requirement', type: 'location_or_npc' }] }).length > 0);
  assert.ok(query({ filters: [{ kind: 'outcome', type: 'recruited_character' }] }).every(paralogue => paralogue.outcomes.some(outcome => outcome.type === 'recruited_character')));
  assert.deepEqual(ids(query({ search: 'Carriage' })), ['secret-of-the-vanished-carriage']);
  assert.deepEqual(ids(query({ filters: [{ kind: 'chapter', route: 'cai', min: null, max: null, unknown: 'only' }] })).sort(), ['diversionary-tactics', 'great-escape', 'missing-brave-warrior-statue', 'queen-of-the-erased', 'sealed-off-past']);
});

test('character filters include associated and required characters while unresolved saved IDs are ignored', () => {
  const fixture = structuredClone(paralogues);
  fixture[0].requirements.push({ type: 'required_participant', text: 'Alexandra must participate.', route_ids: ['dietrich'], character_id: 'alexandra', paralogue_id: null, support_threshold: null, verification_status: 'confirmed', source_keys: ['rpg_site'] });
  const knownIds = new Set([...characterIds, 'alexandra']);
  const required = queryParalogueLibrary(fixture, { ...defaultParalogueSetup(), filters: [{ kind: 'associated_character', characterId: 'alexandra' }] }, knownIds);
  assert.deepEqual(ids(required), [fixture[0].id]);
  assert.equal(queryParalogueLibrary(paralogues, { ...defaultParalogueSetup(), filters: [{ kind: 'associated_character', characterId: 'removed-character' }] }, characterIds).length, 9);
});

test('column shortcuts append in click order before the alphabetical tie-breaker', () => {
  const chapter = paralogueRouteSortField('cai', 'chapter'), deadline = paralogueRouteSortField('dietrich', 'deadline');
  const first = applyParalogueColumnSort(defaultParalogueSetup(), chapter);
  assert.deepEqual(first.sorts, [{ field: chapter, direction: 'asc' }, { field: 'name', direction: 'asc' }]);
  const second = applyParalogueColumnSort(first, deadline);
  assert.deepEqual(second.sorts, [{ field: chapter, direction: 'asc' }, { field: deadline, direction: 'asc' }, { field: 'name', direction: 'asc' }]);
  assert.equal(applyParalogueColumnSort(second, chapter).sorts[0].direction, 'desc');
});

let temporary: string;
before(() => { temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tacticians_loom_paralogue_test_')); });
after(() => { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); });

test('global setup validates and round-trips in user database version four', () => {
  const db = openUserDatabase(path.join(temporary, 'round_trip.sqlite'));
  try {
    assert.equal(db.pragma('user_version', { simple: true }), 4);
    assert.equal(loadParalogueSetup(db), null);
    const custom: ParalogueLibrarySetup = { ...defaultParalogueSetup(), search: 'escape', route: 'leda', filters: [{ kind: 'timing', state: 'forced_start' }] };
    assert.doesNotThrow(() => paralogueSetupSchema.parse(custom));
    const saved = saveParalogueSetup(db, custom, 'dataset-v1');
    assert.ok(saved.savedAt);
    assert.deepEqual(loadParalogueSetup(db)?.setup, custom);
    saveParalogueSetup(db, defaultParalogueSetup(), 'dataset-v2');
    assert.equal(db.prepare('SELECT count(*) FROM paralogue_library_setup').pluck().get(), 1);
  } finally { db.close(); }
});

test('version-three user databases migrate without altering existing player data', () => {
  const file = path.join(temporary, 'migration.sqlite'), Sqlite = loadSqlite(), legacy = new Sqlite(file);
  legacy.exec(`CREATE TABLE library_setups (context TEXT PRIMARY KEY, setup_json TEXT NOT NULL, saved_at TEXT NOT NULL, dataset_version TEXT NOT NULL) STRICT;
    CREATE TABLE class_library_setup (singleton INTEGER PRIMARY KEY, setup_json TEXT NOT NULL, saved_at TEXT NOT NULL, dataset_version TEXT NOT NULL) STRICT;
    CREATE TABLE character_planning (character_id TEXT PRIMARY KEY, is_shortlisted INTEGER NOT NULL, note TEXT NOT NULL, shortlisted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, dataset_version_at_update TEXT NOT NULL) STRICT;
    PRAGMA user_version = 3;`);
  legacy.prepare('INSERT INTO character_planning VALUES (?, 1, ?, ?, ?, ?, ?)').run('alexandra', 'Keep me', '2026-01-01', '2026-01-01', '2026-01-01', 'old');
  legacy.close();
  const migrated = openUserDatabase(file);
  try {
    assert.equal(migrated.pragma('user_version', { simple: true }), 4);
    assert.equal(migrated.prepare('SELECT note FROM character_planning WHERE character_id = ?').pluck().get('alexandra'), 'Keep me');
    assert.equal(loadParalogueSetup(migrated), null);
  } finally { migrated.close(); }
});
