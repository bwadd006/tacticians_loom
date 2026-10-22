import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import { CHANNELS } from '../shared/api';
import { ROUTES, type RouteContext } from '../shared/catalog';
import { getCharacter, getClass, getOverview, listCharacters, openReference } from './database/reference_queries';
import { loadSetup, openUserDatabase, saveSetup } from './database/user_database';
import { z } from 'zod';
import { routeContextSchema, setupSchema } from '../shared/library_setup';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
let reference: Database.Database | undefined;
let userDatabase: Database.Database | undefined;
function getUserDatabase() {
  return userDatabase ??= openUserDatabase(path.join(app.getPath('userData'), 'user_data.sqlite'));
}
app.setName("Tactician's Loom");

function createWindow() {
  const window = new BrowserWindow({
    title: "Tactician's Loom", width: 1440, height: 900, minWidth: 800, minHeight: 600,
    backgroundColor: '#232620', show: false,
    webPreferences: { preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  void window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  return window;
}

function validateId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200) throw new Error('Invalid reference ID');
  return value;
}

app.whenReady().then(async () => {
  reference = openReference(app.isPackaged
    ? path.join(process.resourcesPath, 'reference.sqlite')
    : path.join(app.getAppPath(), 'database/generated/reference.sqlite'));
  // Only the main frame displaying our entry page may use the purpose-specific API.
  function handle(channel: string, fn: (value: unknown) => unknown) {
    ipcMain.handle(channel, (event, value: unknown) => {
      const actual = new URL(event.senderFrame?.url ?? 'about:blank');
      const expected = new URL(MAIN_WINDOW_WEBPACK_ENTRY);
      if (event.senderFrame !== event.sender.mainFrame || actual.protocol !== expected.protocol || actual.host !== expected.host || decodeURIComponent(actual.pathname) !== decodeURIComponent(expected.pathname)) {
        throw new Error('Untrusted reference request');
      }
      return fn(value);
    });
  }
  handle(CHANNELS.overview, () => getOverview(reference!));
  handle(CHANNELS.characters, value => {
    if (value !== 'all' && !(ROUTES as readonly unknown[]).includes(value)) throw new Error('Unknown route context');
    return listCharacters(reference!, value as RouteContext);
  });
  handle(CHANNELS.character, value => getCharacter(reference!, validateId(value)));
  handle(CHANNELS.characterClass, value => getClass(reference!, validateId(value)));
  handle(CHANNELS.conflicts, () => (reference!.prepare("SELECT raw_json FROM data_conflicts WHERE document_kind = 'characters'").all() as { raw_json: string }[]).map(r => JSON.parse(r.raw_json)));
  handle(CHANNELS.saveSetup, value => {
    const request = z.object({ route: routeContextSchema, setup: setupSchema }).strict().parse(value);
    return saveSetup(getUserDatabase(), request.route, request.setup, getOverview(reference!).datasetVersion);
  });
  handle(CHANNELS.loadSetup, value => loadSetup(getUserDatabase(), routeContextSchema.parse(value)));
  const window = createWindow();
  // Bounded integration check uses the actual packaged renderer, preload, IPC and SQLite.
  if (process.argv.includes('--smoke-test')) {
    window.webContents.on('console-message', event => console.error('RENDERER:', event.message));
    const timeout = setTimeout(() => { console.error('SMOKE_FAILED: renderer timed out'); app.exit(1); }, 20000);
    window.webContents.once('did-finish-load', async () => {
      try {
        const result = await window.webContents.executeJavaScript(`(async () => {
          const overview = await window.loom.overview();
          const roster = await window.loom.characters('all');
          const cai = await window.loom.characters('cai');
          const character = await window.loom.character(roster[0].id);
          const characterClass = await window.loom.characterClass('commoner');
          if (!roster.length || !cai.length || character.id !== roster[0].id || !characterClass) throw new Error('Reference query failed');
          if (typeof window.require !== 'undefined') throw new Error('Node leaked into renderer');
          for (let attempt = 0; attempt < 40 && !document.querySelector('#result_count strong'); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
          if (document.querySelector('#result_count strong')?.textContent !== String(overview.actOneCount)) throw new Error('Character Library did not render the Act 1 roster');
          const headers = [...document.querySelectorAll('.character_table thead button')].map(b => b.textContent ?? '');
          for (const route of ['Cai', 'Theodora', 'Dietrich', 'Leda']) if (!headers.some(h => h.includes(route))) throw new Error('Missing availability column: ' + route);
          const portraits = [...document.querySelectorAll('.character_table img.portrait_table')];
          for (let attempt = 0; attempt < 40 && !portraits.some(i => i.complete && i.naturalWidth > 0); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
          if (!portraits.length || !portraits.some(i => i.complete && i.naturalWidth > 0)) throw new Error('Bundled portrait images did not load');
          const affinityIcons = [...document.querySelectorAll('.character_table img.skill_icon')];
          if (!affinityIcons.length || !affinityIcons.some(i => i.complete && i.naturalWidth > 0)) throw new Error('Skill affinity icons did not load');
          const firstCharacter = document.querySelector('.character_name');
          if (!(firstCharacter instanceof HTMLButtonElement)) throw new Error('Character row control missing');
          firstCharacter.click();
          for (let attempt = 0; attempt < 40 && !document.querySelector('#character_details'); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
          if (!document.querySelector('#character_details') || document.activeElement?.id !== 'detail_name') throw new Error('Character details did not open with heading focus');
          const search = document.querySelector('input[aria-label="Search characters"]');
          if (!(search instanceof HTMLInputElement)) throw new Error('Character search missing');
          const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          valueSetter?.call(search, '__no_character_matches_this__');
          search.dispatchEvent(new Event('input', { bubbles: true }));
          for (let attempt = 0; attempt < 40 && document.querySelector('#character_details'); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
          if (document.querySelector('#character_details') || !document.activeElement?.classList.contains('table_scroll')) throw new Error('Filtered character details did not close and restore result focus');
          const setup = { version: 1, search: '', mode: 'all', filters: [], sorts: [{ field: 'name', direction: 'asc' }] };
          const saved = await window.loom.saveSetup('cai', setup);
          const loaded = await window.loom.loadSetup('cai');
          if (saved.datasetVersion !== overview.datasetVersion || !loaded || loaded.datasetVersion !== overview.datasetVersion || loaded.setup.sorts[0]?.field !== 'name') throw new Error('Setup save/load round trip failed');
          if (await window.loom.loadSetup('leda') !== null) throw new Error('Unexpected saved setup for Leda');
          return { overview, rosterCount: roster.length, title: document.title };
        })()`);
        console.log('SMOKE_PASSED', JSON.stringify(result));
        clearTimeout(timeout); app.quit();
      } catch (error) { console.error('SMOKE_FAILED', error); clearTimeout(timeout); app.exit(1); }
    });
  }
}).catch(error => {
  console.error(error);
  if (!process.argv.includes('--smoke-test')) dialog.showErrorBox("Tactician's Loom could not start", String(error));
  app.exit(1);
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { reference?.close(); userDatabase?.close(); });
