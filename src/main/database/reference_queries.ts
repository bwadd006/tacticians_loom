import type Database from 'better-sqlite3';
import { ROUTES,type RouteContext } from '../../shared/catalog';
import type { ClassLibraryData, ParalogueLibraryData, ReferenceOverview, ReferenceConflict } from '../../shared/api';
import type { Character, CharacterClass, CertificationRules, ClassesDocument, ClassUnlock, Paralogue } from '../../shared/source_models';
import { loadSqlite } from './sqlite';
import { getCharacterV3, listCharactersV3, getClassV3, getClassLibraryV3, getParalogueLibraryV3, getOverviewV3, conflictsV3 } from './reference_v3_queries';
const isV3 = (db:Database.Database) => db.pragma('user_version', {simple:true}) === 3;

type JsonRow = { raw_json: string };
export function openReference(filename: string, options: {allowCandidate?:boolean} = {}): Database.Database {
  const Sqlite = loadSqlite();
  const db = new Sqlite(filename, { readonly: true, fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('query_only = ON');
    if (Number(db.pragma('user_version', { simple: true })) !== 3) throw new Error('Unsupported reference schema');
    if (metadata(db, 'validation') !== 'passed') throw new Error('Reference data has not passed validation');
    if (isV3(db) && metadata(db,'release_status') !== 'reviewed' && !options.allowCandidate) throw new Error('Unreviewed candidate reference cannot be used for a normal launch');
    return db;
  } catch (error) { db.close(); throw error; }
}
export function metadata(db: Database.Database, key: string): unknown {
  const row = db.prepare('SELECT value_json FROM build_metadata WHERE key = ?').get(key) as { value_json: string } | undefined;
  return row ? JSON.parse(row.value_json) : null;
}

export function listCharacters(db:Database.Database,route:RouteContext):Character[] {
 if(route!=='all'&&!(ROUTES as readonly string[]).includes(route))throw new Error('Unknown route context');return listCharactersV3(db,route);
}
export const getCharacter=getCharacterV3;
export const getClass=getClassV3;
export const getClassLibrary=getClassLibraryV3;
export const getParalogueLibrary=getParalogueLibraryV3;
export const getOverview=getOverviewV3;
export const getConflicts=conflictsV3;
