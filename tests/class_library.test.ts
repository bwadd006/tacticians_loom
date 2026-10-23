import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classesDocumentSchema, type CharacterClass } from '../src/shared/source_models';
import { queryClassLibrary, unlocksFor } from '../src/shared/class_library_query';
import { classSetupIssues, classSetupSchema, defaultClassSetup, type ClassFilterRule, type ClassLibrarySetup } from '../src/shared/class_library_setup';
import { loadClassSetup, loadSetup, openUserDatabase, saveClassSetup, saveSetup } from '../src/main/database/user_database';
import { defaultSetup } from '../src/shared/library_setup';
import { loadSqlite } from '../src/main/database/sqlite';

const document = classesDocumentSchema.parse(JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/source/fire_emblem_fortunes_weave_classes.json'), 'utf8')));
const classes = document.classes, unlocks = document.route_unlocks;
const ids = (rows: CharacterClass[]) => rows.map(row => row.id);
const withFilter = (rule: ClassFilterRule, overrides: Partial<ClassLibrarySetup> = {}) => queryClassLibrary(classes, unlocks, { ...defaultClassSetup(), ...overrides, filters: [rule] });

test('default Class Library includes every class while tier scope remains outside any-mode rules', () => {
  assert.equal(queryClassLibrary(classes, unlocks, defaultClassSetup()).length, 60);
  const setup: ClassLibrarySetup = { ...defaultClassSetup(), tiers: ['beginner'], mode: 'any', filters: [{ kind: 'movement', tag: 'flying' }, { kind: 'unlock', match: 'has' }] };
  const rows = queryClassLibrary(classes, unlocks, setup);
  assert.equal(rows.length, 0);
  assert.ok(rows.every(row => row.tier === 'beginner'));
  assert.equal(queryClassLibrary(classes, unlocks, { ...defaultClassSetup(), tiers: ['advanced'] }).length, 17);
});

test('growth filters preserve unknown values and growth sorting keeps unknowns last', () => {
  assert.deepEqual(ids(withFilter({ kind: 'number', field: 'hp', min: null, max: null, unknown: 'only' })).sort(), ['cataphract', 'dancer']);
  const known = withFilter({ kind: 'number', field: 'magic', min: 20, max: null, unknown: 'exclude' });
  assert.ok(known.length > 0 && known.every(row => row.class_growth_rate_modifiers_percent.magic! >= 20));
  for (const direction of ['asc', 'desc'] as const) {
    const sorted = queryClassLibrary(classes, unlocks, { ...defaultClassSetup(), tiers: ['advanced'], sorts: [{ field: 'hp', direction }] });
    assert.deepEqual(sorted.slice(-2).map(row => row.id).sort(), ['cataphract', 'dancer']);
  }
});

test('training, certification, mastery and unlock filters use only documented evidence', () => {
  const bowTraining = withFilter({ kind: 'training', skill: 'bows', min: 2 });
  assert.ok(bowTraining.some(row => row.id === 'archer'));
  assert.ok(bowTraining.every(row => (row.skill_exp_bonuses.bows ?? -Infinity) >= 2));
  const grades = withFilter({ kind: 'certification', skill: 'bows' });
  assert.ok(grades.length > 0 && grades.every(row => row.certification.recommended_skill_grades?.some(grade => grade.skill_id === 'bows')));
  assert.ok(withFilter({ kind: 'mastery', query: 'Hit' }).length > 0);
  const documented = withFilter({ kind: 'unlock', match: 'has' });
  assert.equal(documented.length, 23);
  assert.ok(documented.every(row => unlocksFor(row, unlocks).length > 0));
  assert.ok(withFilter({ kind: 'unlock_part', part: 1 }).every(row => unlocksFor(row, unlocks).some(unlock => unlock.part === 1)));
});

test('data-state filters expose uncertainty without inferring eligibility or availability', () => {
  assert.deepEqual(ids(withFilter({ kind: 'data_state', state: 'unknown_growths' })).sort(), ['cataphract', 'dancer']);
  assert.equal(withFilter({ kind: 'data_state', state: 'incomplete_certification' }).length, 60);
  assert.equal(withFilter({ kind: 'data_state', state: 'unverified_weapon_access' }).length, 43);
  assert.equal(withFilter({ kind: 'unlock', match: 'none' }).length, 37);
});

test('Class Library setup validation retains and reports unresolved identifiers', () => {
  assert.doesNotThrow(() => classSetupSchema.parse(defaultClassSetup()));
  assert.throws(() => classSetupSchema.parse({ ...defaultClassSetup(), tiers: [] }));
  assert.throws(() => classSetupSchema.parse({ ...defaultClassSetup(), sorts: [{ field: 'name', direction: 'asc' }, { field: 'name', direction: 'desc' }] }));
  const unresolved: ClassLibrarySetup = { ...defaultClassSetup(), tiers: [...defaultClassSetup().tiers, 'transcendent'], filters: [{ kind: 'training', skill: 'lances', min: 1 }], sorts: [{ field: 'power', direction: 'desc' }] };
  assert.deepEqual(classSetupIssues(unresolved), ['Unavailable tier: transcendent', 'Unavailable skill: lances', 'Unavailable sort: power']);
  assert.equal(queryClassLibrary(classes, unlocks, unresolved).length, 60);
});

let temporary: string;
before(() => { temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tacticians_loom_class_library_test_')); });
after(() => { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); });

test('global Class Library setup round-trips independently from Character Library setups', () => {
  const db = openUserDatabase(path.join(temporary, 'round_trip.sqlite'));
  try {
    assert.equal(db.pragma('user_version', { simple: true }), 2);
    assert.equal(loadClassSetup(db), null);
    const custom: ClassLibrarySetup = { ...defaultClassSetup(), search: 'knight', tiers: ['advanced', 'master'], filters: [{ kind: 'movement', tag: 'cavalry' }], sorts: [{ field: 'speed', direction: 'desc' }] };
    saveSetup(db, 'cai', defaultSetup(), 'dataset-v1');
    const saved = saveClassSetup(db, custom, 'dataset-v1');
    assert.ok(saved.savedAt);
    assert.deepEqual(loadClassSetup(db)?.setup, custom);
    assert.deepEqual(loadSetup(db, 'cai')?.setup, defaultSetup());
    saveClassSetup(db, defaultClassSetup(), 'dataset-v2');
    assert.deepEqual(loadClassSetup(db)?.setup, defaultClassSetup());
    assert.equal(db.prepare('SELECT count(*) FROM class_library_setup').pluck().get(), 1);
  } finally { db.close(); }
});

test('version-one user databases migrate without changing Character Library saves', () => {
  const file = path.join(temporary, 'migration.sqlite');
  const Sqlite = loadSqlite();
  const legacy = new Sqlite(file);
  legacy.exec(`CREATE TABLE library_setups (
    context TEXT PRIMARY KEY CHECK(context IN ('all','cai','theodora','dietrich','leda')),
    setup_json TEXT NOT NULL CHECK(json_valid(setup_json)), saved_at TEXT NOT NULL, dataset_version TEXT NOT NULL
  ) STRICT; PRAGMA user_version = 1;`);
  legacy.prepare('INSERT INTO library_setups VALUES (?, ?, ?, ?)').run('leda', JSON.stringify(defaultSetup()), '2026-01-01T00:00:00.000Z', 'old-data');
  legacy.close();
  const migrated = openUserDatabase(file);
  try {
    assert.equal(migrated.pragma('user_version', { simple: true }), 2);
    assert.deepEqual(loadSetup(migrated, 'leda')?.setup, defaultSetup());
    assert.equal(loadClassSetup(migrated), null);
  } finally { migrated.close(); }
});
