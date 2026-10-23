import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import { CHANNELS } from '../shared/api';
import { ROUTES, type RouteContext } from '../shared/catalog';
import { getCharacter, getClass, getClassLibrary, getOverview, listCharacters, openReference } from './database/reference_queries';
import { loadClassSetup, loadSetup, openUserDatabase, saveClassSetup, saveSetup } from './database/user_database';
import { z } from 'zod';
import { routeContextSchema, setupSchema } from '../shared/library_setup';
import { classSetupSchema } from '../shared/class_library_setup';

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
    backgroundColor: '#080a0d', show: false,
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
  handle(CHANNELS.classLibrary, () => getClassLibrary(reference!));
  handle(CHANNELS.conflicts, () => (reference!.prepare("SELECT raw_json FROM data_conflicts WHERE document_kind = 'characters'").all() as { raw_json: string }[]).map(r => JSON.parse(r.raw_json)));
  handle(CHANNELS.saveSetup, value => {
    const request = z.object({ route: routeContextSchema, setup: setupSchema }).strict().parse(value);
    return saveSetup(getUserDatabase(), request.route, request.setup, getOverview(reference!).datasetVersion);
  });
  handle(CHANNELS.loadSetup, value => loadSetup(getUserDatabase(), routeContextSchema.parse(value)));
  handle(CHANNELS.saveClassSetup, value => saveClassSetup(getUserDatabase(), classSetupSchema.parse(value), getOverview(reference!).datasetVersion));
  handle(CHANNELS.loadClassSetup, () => loadClassSetup(getUserDatabase()));
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
          const classLibrary = await window.loom.classLibrary();
          if (!roster.length || !cai.length || character.id !== roster[0].id || !characterClass || classLibrary.classes.length !== overview.classCount || classLibrary.unlocks.length !== 19) throw new Error('Reference query failed');
          if (typeof window.require !== 'undefined') throw new Error('Node leaked into renderer');
          for (let attempt = 0; attempt < 40 && !document.querySelector('#result_count strong'); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
          if (document.querySelector('#result_count strong')?.textContent !== String(overview.actOneCount)) throw new Error('Character Library did not render the Act 1 roster');
          const headers = [...document.querySelectorAll('.character_table thead button')].map(b => b.textContent ?? '');
          const routeHeaders = headers.slice(-4).map(header => header.trim());
          if (routeHeaders.join('|') !== ['Cai', 'Dietrich', 'Theodora', 'Leda'].join('|')) throw new Error('Recruitment columns are missing or out of order: ' + routeHeaders.join(', '));
          const alexandraRoutes = [...document.querySelectorAll('[data-character-id="alexandra"] .route_summary_cell')];
          const alexandraCai = alexandraRoutes[0]?.textContent ?? '';
          if (alexandraRoutes.length !== 4 || !alexandraCai.includes('Renown: 7') || !alexandraCai.includes('Chapter: 7') || !alexandraCai.includes('Support: 2') || !(alexandraCai.indexOf('Chapter:') < alexandraCai.indexOf('Renown:') && alexandraCai.indexOf('Renown:') < alexandraCai.indexOf('Support:'))) throw new Error('Recruitable route summary is incomplete or out of order');
          const dadaoRoutes = [...document.querySelectorAll('[data-character-id="dadao"] .route_summary_cell')];
          if (!dadaoRoutes[0]?.textContent?.includes('2 × Kothar Gar')) throw new Error('Additional recruitment requirements are missing from the route column');
          const caiAutomatic = document.querySelector('[data-character-id="cai"] .route_summary_cell')?.textContent ?? '';
          if (!caiAutomatic.includes('Automatic join') || !caiAutomatic.includes('Chapter: 1') || caiAutomatic.includes('Renown:') || caiAutomatic.includes('Support:')) throw new Error('Automatic join route summary is not limited to its chapter');
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
          const detailHeadings = [...document.querySelectorAll('#character_details section > h3')].map(heading => heading.textContent ?? '');
          if (detailHeadings.indexOf('Recruitment by route') < 0 || detailHeadings.indexOf('Recruitment by route') > detailHeadings.indexOf('Personal abilities')) throw new Error('Recruitment details are not presented before personal abilities');
          if (detailHeadings.includes('Starting information') || detailHeadings.includes('Source conflicts & notes')) throw new Error('Removed dossier sections are still displayed');
          const visibleText = document.body.innerText;
          if (visibleText.includes('Copy source URL') || visibleText.includes('No additional conditions listed; this does not establish unrestricted recruitment.') || visibleText.includes('source conflict')) throw new Error('Source or removed recruitment copy remains visible');
          const firstRecruitmentFacts = document.querySelector('.recruitment_facts');
          const factText = firstRecruitmentFacts?.textContent ?? '';
          const factLabels = ['Chapter:', 'Renown:', 'Support:', 'Missable:'];
          if (!firstRecruitmentFacts || firstRecruitmentFacts.querySelectorAll('strong').length !== 4 || factLabels.some((label, index) => factText.indexOf(label) < 0 || (index > 0 && factText.indexOf(label) < factText.indexOf(factLabels[index - 1])))) throw new Error('Compact recruitment facts are missing or out of order');
          const resetButtons = [...document.querySelectorAll('main > section:not([hidden]) .result_bar button')].filter(button => button.textContent?.trim() === 'Reset Sorting');
          if (resetButtons.length !== 1 || [...document.querySelectorAll('main > section:not([hidden]) .customize button')].some(button => button.textContent?.trim() === 'Reset Sorting')) throw new Error('Reset Sorting is not uniquely exposed beside Reset Filters');
          const strengthSort = document.querySelector('[aria-label="Sort by Strength"]');
          if (!(strengthSort instanceof HTMLButtonElement)) throw new Error('Strength sort control missing');
          strengthSort.click();
          for (let attempt = 0; attempt < 40 && !document.querySelector('.sort_summary')?.textContent?.includes('Strength'); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
          if (!document.querySelector('.sort_summary')?.textContent?.includes('Strength')) throw new Error('Column sorting did not update');
          if (!(resetButtons[0] instanceof HTMLButtonElement)) throw new Error('Reset Sorting control missing');
          resetButtons[0].click();
          for (let attempt = 0; attempt < 40 && !document.querySelector('.sort_summary')?.textContent?.includes('Name ↑'); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
          if (!document.querySelector('.sort_summary')?.textContent?.includes('Name ↑')) throw new Error('Reset Sorting did not restore name order');
          const fabio = document.querySelector('[data-character-id="fabio"] .character_name');
          if (!(fabio instanceof HTMLButtonElement)) throw new Error('Fabio row control missing');
          fabio.click();
          for (let attempt = 0; attempt < 40 && document.querySelector('#detail_name')?.textContent !== 'Fabio'; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
          const fabioRoutes = [...document.querySelectorAll('#character_details .route_heading h4')].map(heading => heading.textContent?.trim());
          if (fabioRoutes.join('|') !== 'Dietrich|Leda') throw new Error('Dossier includes routes where Fabio is not available: ' + fabioRoutes.join(', '));
          const rootStyle = getComputedStyle(document.documentElement);
          if (rootStyle.getPropertyValue('--details-panel-width').trim() !== '400px') throw new Error('Compact density did not activate at the default window size');
          const affinityCell = document.querySelector('.affinities');
          if (!(affinityCell instanceof HTMLTableCellElement) || parseFloat(getComputedStyle(affinityCell).maxWidth) > 180) throw new Error('Affinity column remained too wide in compact density');
          const tablePortrait = document.querySelector('.portrait_table');
          const skillIcon = document.querySelector('.skill_icon');
          if (rootStyle.fontSize !== '16px' || !(tablePortrait instanceof HTMLImageElement) || parseFloat(getComputedStyle(tablePortrait).width) < 29 || !(skillIcon instanceof HTMLImageElement) || parseFloat(getComputedStyle(skillIcon).width) < 23) throw new Error('Readable text and artwork sizing did not apply');
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
          const classNavigation = [...document.querySelectorAll('.app_navigation button')].find(button => button.textContent?.trim() === 'Class Library');
          if (!(classNavigation instanceof HTMLButtonElement)) throw new Error('Class Library navigation missing');
          classNavigation.click();
          for (let attempt = 0; attempt < 40 && !document.querySelector('#class_result_count strong'); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
          if (document.querySelector('#class_result_count strong')?.textContent !== String(overview.classCount)) throw new Error('Class Library did not render all classes');
          const classTables = [...document.querySelectorAll('.class_table')];
          const classScrollRegions = [...document.querySelectorAll('.class_table_scroll')];
          const tierTitleRows = [...document.querySelectorAll('.tier_title_row')];
          if (classTables.length !== 1 || classScrollRegions.length !== 1) throw new Error('Class Library does not use one table and one scroll region');
          if (tierTitleRows.length !== 6 || tierTitleRows.some(row => row.querySelector('.tier_heading')?.getAttribute('aria-expanded') !== 'true')) throw new Error('Class tier title rows are missing or not expanded');
          const firstClassHeaders = classTables[0]?.querySelectorAll('thead th') ?? [];
          const classHeaderText = [...firstClassHeaders].map(header => header.textContent?.trim() ?? '');
          if (!classHeaderText.includes('Training') || !classHeaderText.includes('HP') || !classHeaderText.includes('Cha') || !classHeaderText.includes('Recommended grades') || !classHeaderText.includes('Mastery') || !classHeaderText.includes('Known unlock')) throw new Error('Hybrid Class Library columns are incomplete');
          const classIcons = [...document.querySelectorAll('.class_table img.class_icon_table')];
          for (let attempt = 0; attempt < 40 && !classIcons.some(icon => icon.complete && icon.naturalWidth > 0); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
          if (!classIcons.some(icon => icon.complete && icon.naturalWidth > 0)) throw new Error('Bundled class icons did not load');
          const dancerGrowths = [...document.querySelectorAll('[data-class-id="dancer"] .class_growth')].map(cell => cell.textContent?.trim());
          if (dancerGrowths.length !== 9 || dancerGrowths.some(value => value !== '—')) throw new Error('Unknown class growths were not preserved');
          const rangerUnlock = document.querySelector('[data-class-id="ranger"] .unlock_cell')?.textContent ?? '';
          if (!rangerUnlock.includes('Dread Warrior Challenge') || !rangerUnlock.includes('+1 more method')) throw new Error('Multiple class unlock methods are not summarized');
          const ranger = document.querySelector('[data-class-id="ranger"] .class_name');
          if (!(ranger instanceof HTMLButtonElement)) throw new Error('Class row control missing');
          ranger.click();
          for (let attempt = 0; attempt < 40 && !document.querySelector('#class_details'); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
          if (document.activeElement?.id !== 'class_detail_name') throw new Error('Class details did not open with heading focus');
          const classDetailHeadings = [...document.querySelectorAll('#class_details section > h3')].map(heading => heading.textContent ?? '');
          if (!classDetailHeadings.includes('Class growth modifiers') || !classDetailHeadings.includes('Certification') || !classDetailHeadings.includes('Active class abilities') || !classDetailHeadings.includes('Mastery reward') || !classDetailHeadings.includes('Known unlock methods')) throw new Error('Class dossier sections are incomplete');
          if (document.querySelectorAll('#class_details .unlock_details').length !== 2 || document.body.innerText.includes('source_url')) throw new Error('Class dossier unlock evidence is incomplete or exposes raw provenance');
          const classSetup = { version: 1, search: '', tiers: ['unique','beginner','specialty','advanced','master','divine'], mode: 'all', filters: [], sorts: [{ field: 'name', direction: 'asc' }] };
          const savedClassSetup = await window.loom.saveClassSetup(classSetup);
          const loadedClassSetup = await window.loom.loadClassSetup();
          if (savedClassSetup.datasetVersion !== overview.datasetVersion || !loadedClassSetup || loadedClassSetup.setup.tiers.length !== 6) throw new Error('Class Library setup save/load round trip failed');
          const characterNavigation = [...document.querySelectorAll('.app_navigation button')].find(button => button.textContent?.trim() === 'Character Library');
          if (!(characterNavigation instanceof HTMLButtonElement)) throw new Error('Character Library navigation missing');
          characterNavigation.click();
          const retainedSearch = document.querySelector('input[aria-label="Search characters"]');
          if (!(retainedSearch instanceof HTMLInputElement) || retainedSearch.value !== '__no_character_matches_this__') throw new Error('Library navigation discarded the unsaved Character Library draft');
          return { overview, rosterCount: roster.length, classCount: classLibrary.classes.length, title: document.title };
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
