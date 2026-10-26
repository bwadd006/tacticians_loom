import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { charactersDocumentSchema } from '../src/shared/source_models';
import { applyShortlistColumnSort, comparisonValuesDiffer, defaultShortlistSorts, sortShortlist, type ShortlistEntry } from '../src/shared/character_comparison';
import { characterPlanningSchema, filterToShortlisted, setCharacterNoteRequestSchema, setShortlistedRequestSchema, type CharacterPlanning } from '../src/shared/character_planning';
import { clearCharacterNote, listCharacterPlanning, loadClassSetup, loadSetup, openUserDatabase, setCharacterNote, setCharacterShortlisted } from '../src/main/database/user_database';
import { loadSqlite } from '../src/main/database/sqlite';
import { defaultSetup } from '../src/shared/library_setup';

const document = charactersDocumentSchema.parse(JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/source/fire_emblem_fortunes_weave_characters.json'), 'utf8')));
const alexandra = document.characters.find(character => character.id === 'alexandra')!;
const cai = document.characters.find(character => character.id === 'cai')!;
let temporary: string;
before(() => { temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tacticians_loom_shortlist_test_')); });
after(() => { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); });

test('planning input and stored-record schemas reject malformed values', () => {
  assert.throws(() => setShortlistedRequestSchema.parse({ characterId: '', shortlisted: true }));
  assert.throws(() => setShortlistedRequestSchema.parse({ characterId: 'cai', shortlisted: 1 }));
  assert.throws(() => setCharacterNoteRequestSchema.parse({ characterId: 'cai', note: 'x'.repeat(10_001) }));
  assert.throws(() => characterPlanningSchema.parse({ characterId: 'cai', shortlisted: true }));
});

test('shortlist membership and retained notes round-trip independently', () => {
  const db = openUserDatabase(path.join(temporary, 'planning.sqlite'));
  try {
    assert.equal(db.pragma('user_version', { simple: true }), 4);
    assert.deepEqual(listCharacterPlanning(db), []);
    const added = setCharacterShortlisted(db, { characterId: 'alexandra', shortlisted: true }, 'dataset-a');
    assert.equal(added.shortlisted, true);
    assert.ok(added.shortlistedAt);
    const noted = setCharacterNote(db, { characterId: 'alexandra', note: 'Compare healing utility.' }, 'dataset-a');
    assert.equal(noted.note, 'Compare healing utility.');
    const removed = setCharacterShortlisted(db, { characterId: 'alexandra', shortlisted: false }, 'dataset-b');
    assert.equal(removed.shortlisted, false);
    assert.equal(removed.shortlistedAt, null);
    assert.equal(removed.note, 'Compare healing utility.');
    const restored = setCharacterShortlisted(db, { characterId: 'alexandra', shortlisted: true }, 'dataset-b');
    assert.equal(restored.note, 'Compare healing utility.');
    assert.ok(restored.shortlistedAt);
    const clearedWhileShortlisted = clearCharacterNote(db, 'alexandra', 'dataset-b');
    assert.equal(clearedWhileShortlisted?.note, '');
    setCharacterShortlisted(db, { characterId: 'alexandra', shortlisted: false }, 'dataset-b');
    assert.equal(clearCharacterNote(db, 'alexandra', 'dataset-b'), null);
    assert.deepEqual(listCharacterPlanning(db), []);
  } finally { db.close(); }
});

test('unresolved stable IDs and notes are preserved', () => {
  const db = openUserDatabase(path.join(temporary, 'unresolved.sqlite'));
  try {
    setCharacterShortlisted(db, { characterId: 'future-character', shortlisted: true }, 'dataset-a');
    setCharacterNote(db, { characterId: 'future-character', note: 'Keep until the reference update lands.' }, 'dataset-a');
    assert.deepEqual(listCharacterPlanning(db).map(record => ({ id: record.characterId, note: record.note })), [{ id: 'future-character', note: 'Keep until the reference update lands.' }]);
  } finally { db.close(); }
});

test('version-two user databases migrate without changing either library setup', () => {
  const file = path.join(temporary, 'version_two.sqlite'), Sqlite = loadSqlite(), legacy = new Sqlite(file);
  legacy.exec(`CREATE TABLE library_setups (
    context TEXT PRIMARY KEY CHECK(context IN ('all','cai','theodora','dietrich','leda')),
    setup_json TEXT NOT NULL CHECK(json_valid(setup_json)), saved_at TEXT NOT NULL, dataset_version TEXT NOT NULL
  ) STRICT;
  CREATE TABLE class_library_setup (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1), setup_json TEXT NOT NULL CHECK(json_valid(setup_json)),
    saved_at TEXT NOT NULL, dataset_version TEXT NOT NULL
  ) STRICT; PRAGMA user_version = 2;`);
  legacy.prepare('INSERT INTO library_setups VALUES (?, ?, ?, ?)').run('cai', JSON.stringify(defaultSetup()), '2026-01-01T00:00:00.000Z', 'old-data');
  legacy.close();
  const migrated = openUserDatabase(file);
  try {
    assert.equal(migrated.pragma('user_version', { simple: true }), 4);
    assert.deepEqual(loadSetup(migrated, 'cai')?.setup, defaultSetup());
    assert.equal(loadClassSetup(migrated), null);
    assert.deepEqual(listCharacterPlanning(migrated), []);
  } finally { migrated.close(); }
});

function planning(characterId: string, shortlistedAt: string): CharacterPlanning {
  return { characterId, shortlisted: true, note: '', shortlistedAt, createdAt: shortlistedAt, updatedAt: shortlistedAt, datasetVersionAtUpdate: 'test' };
}
test('shortlist sorting defaults to name and appends clicked priorities in order', () => {
  const entries: ShortlistEntry[] = [
    { character: cai, planning: planning('cai', '2026-01-02T00:00:00.000Z') },
    { character: alexandra, planning: planning('alexandra', '2026-01-01T00:00:00.000Z') },
  ];
  assert.deepEqual(sortShortlist(entries, defaultShortlistSorts()).map(entry => entry.planning.characterId), ['alexandra', 'cai']);
  const hp = applyShortlistColumnSort(defaultShortlistSorts(), 'hp');
  const strength = applyShortlistColumnSort(hp, 'strength');
  assert.deepEqual(strength, [{ field: 'hp', direction: 'desc' }, { field: 'strength', direction: 'desc' }, { field: 'name', direction: 'asc' }]);
  assert.deepEqual(applyShortlistColumnSort(strength, 'hp')[0], { field: 'hp', direction: 'asc' });
  assert.deepEqual(sortShortlist(entries, [{ field: 'shortlisted_at', direction: 'desc' }]).map(entry => entry.planning.characterId), ['cai', 'alexandra']);
});

test('difference detection treats unknown explicitly and never assigns meaning', () => {
  assert.equal(comparisonValuesDiffer([]), false);
  assert.equal(comparisonValuesDiffer([40]), false);
  assert.equal(comparisonValuesDiffer([40, 40]), false);
  assert.equal(comparisonValuesDiffer([40, 45]), true);
  assert.equal(comparisonValuesDiffer([null, null]), false);
  assert.equal(comparisonValuesDiffer([null, 0]), true);
  assert.equal(comparisonValuesDiffer([{ status: 'automatic' }, { status: 'recruitable' }]), true);
});

test('shortlisted-only scope can only narrow an already-scoped result set', () => {
  const routeScoped = [alexandra];
  assert.deepEqual(filterToShortlisted(routeScoped, new Set(['alexandra', 'cai']), true).map(character => character.id), ['alexandra']);
  assert.deepEqual(filterToShortlisted(routeScoped, new Set(['cai']), true), []);
  assert.deepEqual(filterToShortlisted(routeScoped, new Set(), false), routeScoped);
});
