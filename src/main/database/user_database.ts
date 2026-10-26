import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { loadSqlite } from './sqlite';
import { normalizeLegacyRecruitmentSorts, routeContextSchema, setupSchema, type SavedSetup } from '../../shared/library_setup';
import { classSetupSchema, type SavedClassSetup } from '../../shared/class_library_setup';
import { characterPlanningSchema, setCharacterNoteRequestSchema, setShortlistedRequestSchema, type CharacterPlanning } from '../../shared/character_planning';

export function openUserDatabase(filename: string): Database.Database {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const Sqlite = loadSqlite();
  const db = new Sqlite(filename);
  try {
    const version = db.pragma('user_version', { simple: true });
    if (version !== 0 && version !== 1 && version !== 2 && version !== 3) throw new Error('Saved planning data requires a newer application. Your data has been preserved.');
    db.pragma('journal_mode = WAL');
    if (version === 0) db.transaction(() => {
      db.exec(`CREATE TABLE library_setups (
        context TEXT PRIMARY KEY CHECK(context IN ('all','cai','theodora','dietrich','leda')),
        setup_json TEXT NOT NULL CHECK(json_valid(setup_json)), saved_at TEXT NOT NULL, dataset_version TEXT NOT NULL
      ) STRICT; PRAGMA user_version = 1;`);
    })();
    if (version < 2) db.transaction(() => {
      db.exec(`CREATE TABLE class_library_setup (
        singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
        setup_json TEXT NOT NULL CHECK(json_valid(setup_json)), saved_at TEXT NOT NULL, dataset_version TEXT NOT NULL
      ) STRICT; PRAGMA user_version = 2;`);
    })();
    if (version < 3) db.transaction(() => {
      db.exec(`CREATE TABLE character_planning (
        character_id TEXT PRIMARY KEY CHECK(length(character_id) BETWEEN 1 AND 200),
        is_shortlisted INTEGER NOT NULL CHECK(is_shortlisted IN (0, 1)),
        note TEXT NOT NULL CHECK(length(note) <= 10000),
        shortlisted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        dataset_version_at_update TEXT NOT NULL
      ) STRICT; PRAGMA user_version = 3;`);
    })();
    return db;
  } catch (error) { db.close(); throw error; }
}

interface PlanningRow {
  character_id: string; is_shortlisted: number; note: string; shortlisted_at: string | null;
  created_at: string; updated_at: string; dataset_version_at_update: string;
}
function planningRecord(row: PlanningRow): CharacterPlanning {
  return characterPlanningSchema.parse({
    characterId: row.character_id, shortlisted: row.is_shortlisted === 1, note: row.note,
    shortlistedAt: row.shortlisted_at, createdAt: row.created_at, updatedAt: row.updated_at,
    datasetVersionAtUpdate: row.dataset_version_at_update,
  });
}
export function listCharacterPlanning(db: Database.Database): CharacterPlanning[] {
  return (db.prepare('SELECT * FROM character_planning ORDER BY character_id').all() as PlanningRow[]).map(planningRecord);
}
export function setCharacterShortlisted(db: Database.Database, input: unknown, datasetVersion: string): CharacterPlanning {
  const request = setShortlistedRequestSchema.parse(input), now = new Date().toISOString();
  db.prepare(`INSERT INTO character_planning VALUES (?, ?, '', ?, ?, ?, ?)
    ON CONFLICT(character_id) DO UPDATE SET
      is_shortlisted = excluded.is_shortlisted,
      shortlisted_at = CASE
        WHEN excluded.is_shortlisted = 0 THEN NULL
        WHEN character_planning.is_shortlisted = 1 THEN character_planning.shortlisted_at
        ELSE excluded.shortlisted_at
      END,
      updated_at = excluded.updated_at,
      dataset_version_at_update = excluded.dataset_version_at_update`).run(
    request.characterId, request.shortlisted ? 1 : 0, request.shortlisted ? now : null, now, now, datasetVersion,
  );
  return planningRecord(db.prepare('SELECT * FROM character_planning WHERE character_id = ?').get(request.characterId) as PlanningRow);
}
export function setCharacterNote(db: Database.Database, input: unknown, datasetVersion: string): CharacterPlanning {
  const request = setCharacterNoteRequestSchema.parse(input), now = new Date().toISOString();
  db.prepare(`INSERT INTO character_planning VALUES (?, 0, ?, NULL, ?, ?, ?)
    ON CONFLICT(character_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at,
      dataset_version_at_update = excluded.dataset_version_at_update`).run(request.characterId, request.note, now, now, datasetVersion);
  return planningRecord(db.prepare('SELECT * FROM character_planning WHERE character_id = ?').get(request.characterId) as PlanningRow);
}
export function clearCharacterNote(db: Database.Database, characterId: unknown, datasetVersion: string): CharacterPlanning | null {
  const request = setCharacterNoteRequestSchema.parse({ characterId, note: '' });
  const current = db.prepare('SELECT * FROM character_planning WHERE character_id = ?').get(request.characterId) as PlanningRow | undefined;
  if (!current) return null;
  if (current.is_shortlisted === 0) {
    db.prepare('DELETE FROM character_planning WHERE character_id = ?').run(request.characterId);
    return null;
  }
  return setCharacterNote(db, request, datasetVersion);
}
export function saveClassSetup(db: Database.Database, input: unknown, datasetVersion: string): SavedClassSetup {
  const setup = classSetupSchema.parse(input);
  const savedAt = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`INSERT INTO class_library_setup VALUES (1, ?, ?, ?) ON CONFLICT(singleton) DO UPDATE SET
      setup_json = excluded.setup_json, saved_at = excluded.saved_at, dataset_version = excluded.dataset_version`).run(JSON.stringify(setup), savedAt, datasetVersion);
  })();
  return { setup, savedAt, datasetVersion };
}
export function loadClassSetup(db: Database.Database): SavedClassSetup | null {
  const row = db.prepare('SELECT setup_json, saved_at, dataset_version FROM class_library_setup WHERE singleton = 1').get() as { setup_json: string; saved_at: string; dataset_version: string } | undefined;
  if (!row) return null;
  const parsed = classSetupSchema.safeParse(JSON.parse(row.setup_json));
  if (!parsed.success) throw new Error('This saved Class Library setup has an unsupported format. It has been preserved; your current view is unchanged.');
  return { setup: parsed.data, savedAt: row.saved_at, datasetVersion: row.dataset_version };
}
export function saveSetup(db: Database.Database, context: unknown, input: unknown, datasetVersion: string): SavedSetup {
  const route = routeContextSchema.parse(context);
  const setup = normalizeLegacyRecruitmentSorts(setupSchema.parse(input), route);
  const savedAt = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`INSERT INTO library_setups VALUES (?, ?, ?, ?) ON CONFLICT(context) DO UPDATE SET
      setup_json = excluded.setup_json, saved_at = excluded.saved_at, dataset_version = excluded.dataset_version`).run(route, JSON.stringify(setup), savedAt, datasetVersion);
  })();
  return { setup, savedAt, datasetVersion };
}
export function loadSetup(db: Database.Database, context: unknown): SavedSetup | null {
  const route = routeContextSchema.parse(context);
  const row = db.prepare('SELECT setup_json, saved_at, dataset_version FROM library_setups WHERE context = ?').get(route) as { setup_json: string; saved_at: string; dataset_version: string } | undefined;
  if (!row) return null;
  const parsed = setupSchema.safeParse(JSON.parse(row.setup_json));
  if (!parsed.success) throw new Error('This saved setup has an unsupported format. It has been preserved; your current view is unchanged.');
  return { setup: normalizeLegacyRecruitmentSorts(parsed.data, route), savedAt: row.saved_at, datasetVersion: row.dataset_version };
}
