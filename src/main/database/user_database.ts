import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { loadSqlite } from './sqlite';
import { normalizeLegacyRecruitmentSorts, routeContextSchema, setupSchema, type SavedSetup } from '../../shared/library_setup';
import { classSetupSchema, type SavedClassSetup } from '../../shared/class_library_setup';

export function openUserDatabase(filename: string): Database.Database {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const Sqlite = loadSqlite();
  const db = new Sqlite(filename);
  try {
    const version = db.pragma('user_version', { simple: true });
    if (version !== 0 && version !== 1 && version !== 2) throw new Error('Saved setups require a newer application. Your data has been preserved.');
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
    return db;
  } catch (error) { db.close(); throw error; }
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
