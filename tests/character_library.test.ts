import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROUTES, STATS, type Route, type Skill, type Stat } from '../src/shared/catalog';
import type { Character } from '../src/shared/source_models';
import { abilityMatches, affinity, availabilityLabel, queryLibrary, statusLabel } from '../src/shared/library_query';
import { applyColumnSort, defaultSetup, fieldLabel, initialDrafts, recruitmentSortField, setupIssues, setupSchema, skillLabel, sortableFields, type LibrarySetup } from '../src/shared/library_setup';
import { loadSetup, openUserDatabase, saveSetup } from '../src/main/database/user_database';
import { loadSqlite } from '../src/main/database/sqlite';
import associations from '../data/ability_associations.json';

type Status = 'recruitable' | 'automatic' | 'mandatory_tutorial' | 'not_available_in_part_1_recruitment_table' | 'unavailable' | 'unknown';
interface FixtureOptions {
  growths?: Partial<Record<Stat, number | null>>;
  boons?: Skill[] | null;
  banes?: Skill[] | null;
  statuses?: Partial<Record<Route, Status>>;
  chapters?: Partial<Record<Route, number | null>>;
  renown?: Partial<Record<Route, number | null>>;
  support?: Partial<Record<Route, number | null>>;
  abilities?: { name: string; effect: string | null }[];
}
function fixture(id: string, name: string, options: FixtureOptions = {}): Character {
  const growthRates = {} as Character['growth_rates_percent'];
  for (const stat of STATS) growthRates[stat] = options.growths?.[stat] === undefined ? 30 : options.growths[stat]!;
  const recruitmentByRoute = {} as Character['recruitment_by_route'];
  for (const route of ROUTES) {
    recruitmentByRoute[route] = {
      status: options.statuses?.[route] ?? 'unavailable',
      earliest_chapter: options.chapters?.[route] ?? null, min_renown: options.renown?.[route] ?? null, min_support: options.support?.[route] ?? null,
      requirements: [], missable: null, source: null,
    };
  }
  return {
    id, name, availability_category: 'test_fixture',
    growth_rates_percent: growthRates, growth_rates_source: 'test fixture',
    effective_personal_growth_rates_percent: null, effective_growth_rates_note: null,
    starting_level: null, starting_class: null, base_stats: null, base_stats_note: 'test fixture',
    skill_proficiencies: { boons: options.boons === undefined ? [] : options.boons, banes: options.banes === undefined ? [] : options.banes, verified: false, source: null },
    personal_abilities: (options.abilities ?? []).map((ability, index) => ({
      name: ability.name, effect: ability.effect,
      acquisition: { type: 'test', level: null }, source: 'test fixture', rank: index + 1,
    })),
    recruitment_by_route: recruitmentByRoute,
    flags: { recruitable_or_joins_in_part_1: true, available_part_1_routes: [] },
    notes: [],
  } as Character;
}
function ids(rows: Character[]): string[] { return rows.map(c => c.id); }
function numberRule(field: string, min: number | null, max: number | null, unknown: 'exclude' | 'include' | 'only' = 'exclude'): LibrarySetup['filters'][number] {
  return { kind: 'number', field, min, max, unknown };
}
function skillRule(skill: string, match: 'boon' | 'bane' | 'neutral' | 'not_bane' | 'unknown' | 'ability'): LibrarySetup['filters'][number] {
  return { kind: 'skill', skill, match };
}

const brawn = fixture('brawn', 'Brawn', { growths: { strength: 45, speed: 20 }, statuses: { cai: 'recruitable' }, boons: ['swords'], banes: ['riding'], renown: { cai: 100 } });
const fleet = fixture('fleet', 'Fleet', { growths: { strength: 30, speed: 40 }, statuses: { cai: 'recruitable', theodora: 'recruitable' } });
const enigma = fixture('enigma', 'Enigma', { growths: Object.fromEntries(STATS.map(s => [s, null])), statuses: { cai: 'automatic' }, boons: null, banes: null });
const remote = fixture('remote', 'Remote', { growths: { strength: 50, speed: 50 }, statuses: { theodora: 'recruitable' }, boons: ['bows'], banes: ['swords'] });
const absent = fixture('absent', 'Absent');
const roster = [brawn, fleet, enigma, remote, absent];

test('All Routes is the distinct union; a specific route limits rows and search is case-insensitive', () => {
  assert.deepEqual(ids(queryLibrary(roster, 'all', defaultSetup())), ['brawn', 'enigma', 'fleet', 'remote']);
  assert.deepEqual(ids(queryLibrary(roster, 'cai', defaultSetup())), ['brawn', 'enigma', 'fleet']);
  assert.deepEqual(ids(queryLibrary(roster, 'theodora', defaultSetup())), ['fleet', 'remote']);
  assert.deepEqual(ids(queryLibrary(roster, 'dietrich', defaultSetup())), []);
  assert.deepEqual(ids(queryLibrary(roster, 'all', { ...defaultSetup(), search: '  ENI ' })), ['enigma']);
});

test('"any" filter mode can never bypass the selected-route restriction', () => {
  const setup: LibrarySetup = { ...defaultSetup(), mode: 'any', filters: [numberRule('strength', 48, null)] };
  assert.deepEqual(ids(queryLibrary(roster, 'all', setup)), ['remote']);
  assert.deepEqual(ids(queryLibrary(roster, 'cai', setup)), []);
});

test('numeric filters respect bounds and keep unknown values distinct from zero', () => {
  const atLeast40: LibrarySetup = { ...defaultSetup(), filters: [numberRule('strength', 40, null)] };
  assert.deepEqual(ids(queryLibrary(roster, 'all', atLeast40)), ['brawn', 'remote']);
  const includeUnknown: LibrarySetup = { ...defaultSetup(), filters: [numberRule('strength', 40, null, 'include')] };
  assert.deepEqual(ids(queryLibrary(roster, 'all', includeUnknown)), ['brawn', 'enigma', 'remote']);
  const onlyUnknown: LibrarySetup = { ...defaultSetup(), filters: [numberRule('strength', 40, null, 'only')] };
  assert.deepEqual(ids(queryLibrary(roster, 'all', onlyUnknown)), ['enigma']);
  const range: LibrarySetup = { ...defaultSetup(), filters: [numberRule('speed', 15, 30)] };
  assert.deepEqual(ids(queryLibrary(roster, 'all', range)), ['brawn']);
});

test('skill filters distinguish boon, bane, neutral and unknown without treating null as absence', () => {
  const by = (rule: LibrarySetup['filters'][number]) => ids(queryLibrary(roster, 'all', { ...defaultSetup(), filters: [rule] }));
  assert.deepEqual(by(skillRule('swords', 'boon')), ['brawn']);
  assert.deepEqual(by(skillRule('swords', 'bane')), ['remote']);
  assert.deepEqual(by(skillRule('swords', 'neutral')), ['fleet']);
  assert.deepEqual(by(skillRule('swords', 'not_bane')), ['brawn', 'fleet']);
  assert.deepEqual(by(skillRule('swords', 'unknown')), ['enigma']);
});

test('ability filters use reviewed associations and recheck them against the active dataset', () => {
  const reviewedEvidence=associations.entries.find(e=>e.characterId==='aswan'&&e.abilityName==='Princess of Arrows')!.evidence;
  const archer = fixture('aswan', 'Aswan', { statuses: { cai: 'recruitable' }, abilities: [{ name: 'Princess of Arrows', effect: reviewedEvidence }] });
  assert.equal(abilityMatches(archer, 'bows').length, 1);
  assert.equal(abilityMatches(archer, 'axes').length, 0);
  const stale = fixture('aswan', 'Aswan', { statuses: { cai: 'recruitable' }, abilities: [{ name: 'Princess of Arrows', effect: reviewedEvidence+' stale' }] });
  assert.equal(abilityMatches(stale, 'bows').length, 0);
  const setup: LibrarySetup = { ...defaultSetup(), filters: [skillRule('bows', 'ability')] };
  assert.deepEqual(ids(queryLibrary([...roster, archer], 'all', setup)), ['aswan']);
});

test('sort priorities break ties in order and unknown values stay last in both directions', () => {
  const alpha = fixture('alpha', 'Alpha', { growths: { strength: 40, speed: 10 }, statuses: { cai: 'recruitable' } });
  const beta = fixture('beta', 'Beta', { growths: { strength: 40, speed: 20 }, statuses: { cai: 'recruitable' } });
  const group = [beta, alpha, enigma];
  const by = (sorts: LibrarySetup['sorts']) => ids(queryLibrary(group, 'all', { ...defaultSetup(), sorts }));
  assert.deepEqual(by([{ field: 'strength', direction: 'desc' }, { field: 'speed', direction: 'desc' }]), ['beta', 'alpha', 'enigma']);
  assert.deepEqual(by([{ field: 'strength', direction: 'desc' }, { field: 'speed', direction: 'asc' }]), ['alpha', 'beta', 'enigma']);
  assert.deepEqual(by([{ field: 'speed', direction: 'asc' }]), ['alpha', 'beta', 'enigma']);
  assert.deepEqual(by([{ field: 'speed', direction: 'desc' }]), ['beta', 'alpha', 'enigma']);
  assert.deepEqual(by([{ field: 'name', direction: 'desc' }]), ['enigma', 'beta', 'alpha']);
});

test('affinity sorting orders boon, neutral, then bane, with unknown affinities last', () => {
  const asc = ids(queryLibrary(roster, 'all', { ...defaultSetup(), sorts: [{ field: 'affinity:swords', direction: 'asc' }] }));
  assert.deepEqual(asc, ['brawn', 'fleet', 'remote', 'enigma']);
  const desc = ids(queryLibrary(roster, 'all', { ...defaultSetup(), sorts: [{ field: 'affinity:swords', direction: 'desc' }] }));
  assert.deepEqual(desc, ['remote', 'fleet', 'brawn', 'enigma']);
});

test('availability sorting places available characters first, confirmed unavailable next, unknowns last', () => {
  const setup: LibrarySetup = { ...defaultSetup(), sorts: [{ field: 'availability:theodora', direction: 'asc' }] };
  assert.deepEqual(ids(queryLibrary(roster, 'cai', setup)), ['fleet', 'brawn', 'enigma']);
});

test('route-qualified recruitment priorities work in All Routes and break ties in explicit order', () => {
  const alpha = fixture('alpha', 'Alpha', { statuses: { cai: 'recruitable', dietrich: 'recruitable', theodora: 'recruitable', leda: 'recruitable' }, chapters: { cai: 3, dietrich: 4, theodora: 2, leda: 5 }, renown: { cai: 9, dietrich: 4, theodora: 5, leda: 7 } });
  const beta = fixture('beta', 'Beta', { statuses: { cai: 'recruitable', dietrich: 'recruitable', theodora: 'recruitable', leda: 'recruitable' }, chapters: { cai: 3, dietrich: 9, theodora: 2, leda: 9 }, renown: { cai: 8, dietrich: 9, theodora: 5, leda: 9 } });
  const gamma = fixture('gamma', 'Gamma', { statuses: { cai: 'recruitable', dietrich: 'recruitable', theodora: 'recruitable', leda: 'recruitable' }, chapters: { cai: 1, dietrich: 1, theodora: 2, leda: 1 }, renown: { cai: 1, dietrich: 1, theodora: 6, leda: 1 } });
  const remote = fixture('remote_sort', 'Remote', { statuses: { cai: 'recruitable' }, chapters: { cai: 1 }, renown: { cai: 1 } });
  const priorityRoutes = ['theodora', 'cai', 'dietrich', 'leda'] as const;
  const sorts = priorityRoutes.flatMap(route => [
    { field: recruitmentSortField(route, 'earliest_chapter'), direction: 'asc' as const },
    { field: recruitmentSortField(route, 'min_renown'), direction: 'asc' as const },
  ]);
  assert.deepEqual(ids(queryLibrary([alpha, beta, gamma, remote], 'all', { ...defaultSetup(), sorts })), ['beta', 'alpha', 'gamma', 'remote_sort']);
  assert.deepEqual(ids(queryLibrary([alpha, beta, gamma, remote], 'cai', { ...defaultSetup(), sorts })), ['beta', 'alpha', 'gamma', 'remote_sort']);
});

test('route-qualified recruitment unknowns stay last in either direction', () => {
  const field = recruitmentSortField('cai', 'min_renown');
  const asc = ids(queryLibrary(roster, 'all', { ...defaultSetup(), sorts: [{ field, direction: 'asc' }] }));
  const desc = ids(queryLibrary(roster, 'all', { ...defaultSetup(), sorts: [{ field, direction: 'desc' }] }));
  assert.deepEqual(asc, ['brawn', 'enigma', 'fleet', 'remote']);
  assert.deepEqual(desc, ['brawn', 'enigma', 'fleet', 'remote']);
});

test('column shortcuts append in click order before the Name tie-breaker', () => {
  const chapter = recruitmentSortField('theodora', 'earliest_chapter');
  const renown = recruitmentSortField('theodora', 'min_renown');
  const primary = applyColumnSort(defaultSetup(), chapter);
  assert.deepEqual(primary.sorts, [{ field: chapter, direction: 'asc' }, { field: 'name', direction: 'asc' }]);
  const appended = applyColumnSort(primary, renown);
  assert.deepEqual(appended.sorts, [{ field: chapter, direction: 'asc' }, { field: renown, direction: 'asc' }, { field: 'name', direction: 'asc' }]);
  assert.deepEqual(applyColumnSort(appended, renown).sorts, [{ field: chapter, direction: 'asc' }, { field: renown, direction: 'desc' }, { field: 'name', direction: 'asc' }]);
  assert.deepEqual(applyColumnSort(appended, 'strength').sorts, [{ field: chapter, direction: 'asc' }, { field: renown, direction: 'asc' }, { field: 'strength', direction: 'desc' }, { field: 'name', direction: 'asc' }]);
});

test('automatic joins use documented chapters without inventing Renown values', () => {
  const automatic = fixture('automatic', 'Automatic', { statuses: { cai: 'automatic' }, chapters: { cai: 2 } });
  const recruit = fixture('recruit', 'Recruit', { statuses: { cai: 'recruitable' }, chapters: { cai: 3 }, renown: { cai: 4 } });
  assert.deepEqual(ids(queryLibrary([recruit, automatic], 'all', { ...defaultSetup(), sorts: [{ field: recruitmentSortField('cai', 'earliest_chapter'), direction: 'asc' }] })), ['automatic', 'recruit']);
  assert.deepEqual(ids(queryLibrary([recruit, automatic], 'all', { ...defaultSetup(), sorts: [{ field: recruitmentSortField('cai', 'min_renown'), direction: 'asc' }] })), ['recruit', 'automatic']);
});

test('route recruitment fields filter on a specific route and are unresolved on All Routes', () => {
  const rule = numberRule('min_renown', null, 100);
  assert.deepEqual(ids(queryLibrary(roster, 'cai', { ...defaultSetup(), filters: [rule] })), ['brawn']);
  const onAll: LibrarySetup = { ...defaultSetup(), filters: [rule] };
  assert.deepEqual(ids(queryLibrary(roster, 'all', onAll)), ['brawn', 'enigma', 'fleet', 'remote']);
  assert.deepEqual(setupIssues(onAll, 'all'), ['Unavailable field: min_renown']);
  assert.deepEqual(setupIssues(onAll, 'cai'), []);
});

test('unresolved saved rules are retained but not applied, and reported as issues', () => {
  const bogusSkill: LibrarySetup = { ...defaultSetup(), filters: [skillRule('lances', 'boon')] };
  assert.deepEqual(ids(queryLibrary(roster, 'all', bogusSkill)), ['brawn', 'enigma', 'fleet', 'remote']);
  assert.deepEqual(setupIssues(bogusSkill, 'all'), ['Unavailable skill: lances']);
  const bogusSort: LibrarySetup = { ...defaultSetup(), sorts: [{ field: 'wieldiness', direction: 'desc' }] };
  assert.deepEqual(ids(queryLibrary(roster, 'all', bogusSort)), ['brawn', 'enigma', 'fleet', 'remote']);
  assert.deepEqual(setupIssues(bogusSort, 'all'), ['Unavailable sort: wieldiness']);
});

test('labels and affinity helpers reflect reported statuses and unknowns', () => {
  assert.equal(availabilityLabel('recruitable'), 'Available');
  assert.equal(availabilityLabel('not_available_in_part_1_recruitment_table'), 'Not listed');
  assert.equal(availabilityLabel('unavailable'), 'Unavailable');
  assert.equal(availabilityLabel('unknown'), 'Unknown');
  assert.equal(statusLabel('automatic'), 'Automatic join');
  assert.equal(statusLabel('mandatory_tutorial'), 'Tutorial join');
  assert.equal(statusLabel('recruitable'), 'Recruitable');
  assert.equal(affinity(brawn, 'swords'), 'boon');
  assert.equal(affinity(brawn, 'riding'), 'bane');
  assert.equal(affinity(fleet, 'swords'), 'neutral');
  assert.equal(affinity(enigma, 'swords'), 'unknown');
  assert.equal(affinity(brawn, 'lances'), 'unknown');
  assert.equal(skillLabel('black_magic'), 'Black Magic');
  assert.equal(fieldLabel('strength'), 'Strength');
  assert.equal(fieldLabel('affinity:swords'), 'Swords affinity');
  assert.equal(fieldLabel('availability:cai'), 'Cai availability');
  assert.equal(fieldLabel('min_renown'), 'Renown');
  assert.equal(fieldLabel(recruitmentSortField('theodora', 'earliest_chapter')), 'Theodora — Chapter');
  for (const route of ROUTES) for (const field of ['earliest_chapter', 'min_renown', 'min_support'] as const) {
    assert.ok(sortableFields('all').includes(recruitmentSortField(route, field)));
  }
});

test('setup schema accepts the default and rejects malformed or contradictory rules', () => {
  assert.doesNotThrow(() => setupSchema.parse(defaultSetup()));
  const drafts = initialDrafts();
  assert.deepEqual(Object.keys(drafts), ['all', ...ROUTES]);
  for (const context of Object.keys(drafts)) assert.deepEqual(drafts[context as keyof typeof drafts], defaultSetup());
  assert.throws(() => setupSchema.parse({ ...defaultSetup(), filters: [{ kind: 'number', field: 'strength', min: 50, max: 40, unknown: 'exclude' }] }));
  assert.throws(() => setupSchema.parse({ ...defaultSetup(), filters: [{ kind: 'number', field: 'strength', min: Infinity, max: null, unknown: 'exclude' }] }));
  assert.throws(() => setupSchema.parse({ ...defaultSetup(), sorts: [{ field: 'name', direction: 'asc' }, { field: 'name', direction: 'desc' }] }));
  assert.throws(() => setupSchema.parse({ ...defaultSetup(), sorts: [{ field: 'name', direction: 'up' }] }));
  assert.throws(() => setupSchema.parse({ ...defaultSetup(), unexpected: true }));
});

let temporary: string;
before(() => { temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tacticians_loom_library_test_')); });
after(() => { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); });

test('saved setups round-trip per context, replace on re-save, and stay independent', () => {
  const db = openUserDatabase(path.join(temporary, 'round_trip.sqlite'));
  try {
    assert.equal(loadSetup(db, 'cai'), null);
    const custom: LibrarySetup = { ...defaultSetup(), search: 'mage', filters: [numberRule('magic', 35, null)], sorts: [{ field: 'magic', direction: 'desc' }, { field: 'name', direction: 'asc' }] };
    const saved = saveSetup(db, 'cai', custom, 'dataset-v1');
    assert.equal(saved.datasetVersion, 'dataset-v1');
    assert.ok(saved.savedAt);
    const loaded = loadSetup(db, 'cai');
    assert.deepEqual(loaded?.setup, custom);
    assert.equal(loaded?.datasetVersion, 'dataset-v1');
    // One saved setup per context: re-saving replaces rather than accumulates.
    saveSetup(db, 'cai', defaultSetup(), 'dataset-v2');
    assert.deepEqual(loadSetup(db, 'cai')?.setup, defaultSetup());
    assert.equal(db.prepare('SELECT count(*) AS count FROM library_setups').pluck().get(), 1);
    // Contexts are independent.
    saveSetup(db, 'all', custom, 'dataset-v1');
    assert.equal(loadSetup(db, 'theodora'), null);
    assert.deepEqual(loadSetup(db, 'all')?.setup, custom);
    assert.deepEqual(loadSetup(db, 'cai')?.setup, defaultSetup());
  } finally { db.close(); }
});

test('legacy selected-route recruitment sorts load as route-qualified priorities', () => {
  const db = openUserDatabase(path.join(temporary, 'legacy_recruitment_sort.sqlite'));
  try {
    const legacy: LibrarySetup = { ...defaultSetup(), sorts: [
      { field: 'earliest_chapter', direction: 'asc' },
      { field: 'min_renown', direction: 'asc' },
    ] };
    const saved = saveSetup(db, 'theodora', legacy, 'dataset-v1');
    assert.deepEqual(saved.setup.sorts, [
      { field: recruitmentSortField('theodora', 'earliest_chapter'), direction: 'asc' },
      { field: recruitmentSortField('theodora', 'min_renown'), direction: 'asc' },
    ]);
    assert.deepEqual(loadSetup(db, 'theodora')?.setup, saved.setup);

    db.prepare('UPDATE library_setups SET setup_json = ? WHERE context = ?').run(JSON.stringify(legacy), 'theodora');
    assert.deepEqual(loadSetup(db, 'theodora')?.setup.sorts, saved.setup.sorts);
  } finally { db.close(); }
});

test('invalid contexts and setups are rejected before touching storage', () => {
  const db = openUserDatabase(path.join(temporary, 'rejects.sqlite'));
  try {
    assert.throws(() => saveSetup(db, 'kai', defaultSetup(), 'dataset-v1'));
    assert.throws(() => saveSetup(db, 'cai', { ...defaultSetup(), filters: [{ kind: 'skill', skill: 'swords', match: 'boon', extra: 1 }] }, 'dataset-v1'));
    assert.throws(() => loadSetup(db, 'everywhere'));
    assert.equal(loadSetup(db, 'cai'), null);
  } finally { db.close(); }
});

test('a stored setup with an unsupported format is refused and preserved, not discarded', () => {
  const db = openUserDatabase(path.join(temporary, 'corrupt.sqlite'));
  try {
    const legacy = JSON.stringify({ version: 2, search: '', mode: 'all', filters: [], sorts: [] });
    db.prepare('INSERT INTO library_setups VALUES (?, ?, ?, ?)').run('cai', legacy, '2026-01-01T00:00:00.000Z', 'dataset-v0');
    assert.throws(() => loadSetup(db, 'cai'), /unsupported format/);
    assert.equal(db.prepare('SELECT setup_json FROM library_setups WHERE context = ?').pluck().get('cai'), legacy);
    // The player can recover by saving a fresh, valid setup over it.
    saveSetup(db, 'cai', defaultSetup(), 'dataset-v1');
    assert.deepEqual(loadSetup(db, 'cai')?.setup, defaultSetup());
  } finally { db.close(); }
});

test('a database from a newer schema version is refused without data loss', () => {
  const file = path.join(temporary, 'newer.sqlite');
  const db = openUserDatabase(file);
  saveSetup(db, 'cai', defaultSetup(), 'dataset-v1');
  db.pragma('user_version = 5');
  db.close();
  assert.throws(() => openUserDatabase(file), /newer application/);
  const Sqlite = loadSqlite();
  const raw = new Sqlite(file);
  try {
    raw.pragma('user_version = 4');
    assert.deepEqual(raw.prepare('SELECT context FROM library_setups').pluck().all(), ['cai']);
  } finally { raw.close(); }
  // Reopening a current-version database preserves saved setups.
  const reopened = openUserDatabase(file);
  try { assert.deepEqual(loadSetup(reopened, 'cai')?.setup, defaultSetup()); }
  finally { reopened.close(); }
});
