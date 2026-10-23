import type Database from 'better-sqlite3';
import { REFERENCE_SCHEMA_VERSION, ROUTES, ROUTE_NAMES, type RouteContext } from '../../shared/catalog';
import type { ClassLibraryData, ReferenceOverview } from '../../shared/api';
import type { Character, CharacterClass, CertificationRules, ClassesDocument, ClassUnlock } from '../../shared/source_models';
import { loadSqlite } from './sqlite';

type JsonRow = { raw_json: string };
export function openReference(filename: string): Database.Database {
  const Sqlite = loadSqlite();
  const db = new Sqlite(filename, { readonly: true, fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('query_only = ON');
    if (db.pragma('user_version', { simple: true }) !== REFERENCE_SCHEMA_VERSION) throw new Error('Unsupported reference schema');
    if (metadata(db, 'validation') !== 'passed') throw new Error('Reference data has not passed validation');
    return db;
  } catch (error) { db.close(); throw error; }
}
export function metadata(db: Database.Database, key: string): unknown {
  const row = db.prepare('SELECT value_json FROM build_metadata WHERE key = ?').get(key) as { value_json: string } | undefined;
  return row ? JSON.parse(row.value_json) : null;
}
export function listCharacters(db: Database.Database, route: RouteContext): Character[] {
  if (route !== 'all' && !(ROUTES as readonly string[]).includes(route)) throw new Error('Unknown route context');
  const sql = route === 'all'
    ? 'SELECT raw_json FROM act_1_roster ORDER BY name COLLATE NOCASE, id'
    : `SELECT c.raw_json FROM characters c JOIN recruitment r ON c.id = r.character_id
       WHERE r.route_id = ? AND r.status IN ('recruitable','automatic','mandatory_tutorial')
       ORDER BY c.name COLLATE NOCASE, c.id`;
  const query = db.prepare(sql);
  const rows = (route === 'all' ? query.all() : query.all(route)) as JsonRow[];
  return rows.map(r => JSON.parse(r.raw_json) as Character);
}
export function getCharacter(db: Database.Database, id: string): Character | null {
  const row = db.prepare('SELECT raw_json FROM characters WHERE id = ?').get(id) as JsonRow | undefined;
  return row ? JSON.parse(row.raw_json) : null;
}
export function getClass(db: Database.Database, id: string): CharacterClass | null {
  const row = db.prepare('SELECT raw_json FROM classes WHERE id = ?').get(id) as JsonRow | undefined;
  return row ? JSON.parse(row.raw_json) : null;
}
export function getClassLibrary(db: Database.Database): ClassLibraryData {
  const classes = (db.prepare(`SELECT raw_json FROM classes ORDER BY CASE tier_id
    WHEN 'unique' THEN 0 WHEN 'beginner' THEN 1 WHEN 'specialty' THEN 2
    WHEN 'advanced' THEN 3 WHEN 'master' THEN 4 WHEN 'divine' THEN 5 ELSE 6 END,
    name COLLATE NOCASE, id`).all() as JsonRow[]).map(row => JSON.parse(row.raw_json) as CharacterClass);
  const certificationRules = Object.fromEntries((db.prepare('SELECT id, raw_json FROM certification_tiers').all() as { id: string; raw_json: string }[]).map(row => [row.id, JSON.parse(row.raw_json)])) as CertificationRules;
  const unlocks = (db.prepare('SELECT raw_json FROM route_unlocks ORDER BY act, earliest_chapter, id').all() as JsonRow[]).map(row => JSON.parse(row.raw_json) as ClassUnlock);
  const source = db.prepare("SELECT raw_json FROM source_documents WHERE kind = 'classes'").get() as JsonRow;
  const restrictions = (JSON.parse(source.raw_json) as ClassesDocument).character_restrictions;
  const conflicts = (db.prepare("SELECT class_id, field, status FROM data_conflicts WHERE document_kind = 'classes'").all() as { class_id: string | null; field: string; status: string }[])
    .map(row => ({ classId: row.class_id, field: row.field, status: row.status }));
  return { classes, certificationRules, unlocks, restrictions: { verified: restrictions.global_character_class_restrictions_verified, note: restrictions.note }, conflicts };
}
export function getOverview(db: Database.Database): ReferenceOverview {
  const count = (sql: string) => (db.prepare(sql).get() as { count: number }).count;
  return {
    datasetVersion: String(metadata(db, 'dataset_version')),
    changeSummary: String(metadata(db, 'change_summary')),
    characterCount: count('SELECT count(*) AS count FROM characters'),
    actOneCount: count('SELECT count(*) AS count FROM act_1_roster'),
    classCount: count('SELECT count(*) AS count FROM classes'),
    conflictCount: count('SELECT count(*) AS count FROM data_conflicts'),
    routes: ROUTES.map(id => ({ id, name: ROUTE_NAMES[id], count: listCharacters(db, id).length })),
  };
}
