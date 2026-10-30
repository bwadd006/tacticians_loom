import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { app, BrowserWindow, dialog, ipcMain, protocol, net, session } from 'electron';
import { pathToFileURL } from 'node:url';
import { loadAssetFiles, resolveAssetRequest } from './asset_files';
import { assetUrl } from '../shared/asset_catalog';
import type Database from 'better-sqlite3';
import { CHANNELS } from '../shared/api';
import { ROUTES, type RouteContext } from '../shared/catalog';
import { getCharacter, getClass, getClassLibrary, getOverview, getParalogueLibrary, getConflicts, listCharacters, openReference } from './database/reference_queries';
import { clearCharacterNote, listCharacterPlanning, loadClassSetup, loadParalogueSetup, loadSetup, openUserDatabase, saveClassSetup, saveParalogueSetup, saveSetup, setCharacterNote, setCharacterShortlisted } from './database/user_database';
import { z } from 'zod';
import { routeContextSchema, setupSchema } from '../shared/library_setup';
import { classSetupSchema } from '../shared/class_library_setup';
import { paralogueSetupSchema } from '../shared/paralogue_library_setup';
import { setCharacterNoteRequestSchema, setShortlistedRequestSchema } from '../shared/character_planning';
import { referenceV3Smoke } from './reference_v3_smoke';
import { referenceBaselineSmoke } from './reference_baseline_smoke';
import * as referenceDetails from './database/reference_details';
import { referenceReleaseSmoke } from './reference_release_smoke';
import { seedExistingSmokeSave } from './smoke_player_data';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
let reference: Database.Database | undefined;
let userDatabase: Database.Database | undefined;
const smokeTest = process.argv.includes('--smoke-test');
const smokeUserData = smokeTest ? fs.mkdtempSync(path.join(os.tmpdir(), 'tacticians_loom_smoke_')) : undefined;
if (smokeUserData) {
  app.setPath('userData', smokeUserData);
  // Electron may write session files after its quit event. A detached Node-mode
  // helper waits for this process to end before removing the isolated profile.
  const cleanupScript = `
    const fs = require('node:fs');
    const target = process.argv[1];
    const parentPid = Number(process.argv[2]);
    function cleanAfterExit() {
      try { process.kill(parentPid, 0); setTimeout(cleanAfterExit, 50); }
      catch { fs.rmSync(target, { recursive: true, force: true }); }
    }
    cleanAfterExit();
  `;
  const cleanup = spawn(process.execPath, ['-e', cleanupScript, smokeUserData, String(process.pid)], {
    detached: true, stdio: 'ignore', windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  cleanup.unref();
}
function closeDatabases() {
  reference?.close();
  userDatabase?.close();
  reference = undefined;
  userDatabase = undefined;
}
function getUserDatabase() {
  return userDatabase ??= openUserDatabase(path.join(app.getPath('userData'), 'user_data.sqlite'));
}
app.setName("Tactician's Loom");
protocol.registerSchemesAsPrivileged([{scheme:'loom-art',privileges:{standard:true,secure:true}}]);

function createWindow() {
  const window = new BrowserWindow({
    title: "Tactician's Loom", width: 1440, height: 900, minWidth: 800, minHeight: 600,
    backgroundColor: '#080a0d', show: false,
    webPreferences: { preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.once('ready-to-show', () => { if (!smokeTest) window.show(); });
  void window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  return window;
}

function validateId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200) throw new Error('Invalid reference ID');
  return value;
}

app.whenReady().then(async () => {
  let outboundRequests=0;
  if(smokeTest&&app.isPackaged)session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_request,callback)=>{outboundRequests++;callback({cancel:true});});
  const smokeReferenceIndex=smokeTest ? process.argv.indexOf('--smoke-reference') : -1;
  const smokeReference=smokeReferenceIndex>=0 ? process.argv[smokeReferenceIndex+1] : undefined;
  if(smokeReferenceIndex>=0 && (!smokeReference || smokeReference.startsWith('--'))) throw new Error('--smoke-reference requires a fixture database filename');
  const referenceFile=smokeReference ? path.resolve(smokeReference) : app.isPackaged
    ? path.join(process.resourcesPath,'reference.sqlite')
    : path.join(app.getAppPath(),'database/generated/reference.sqlite');
  if(!fs.existsSync(referenceFile)) {
    if(smokeReference)throw new Error(`Smoke-test reference database is missing at ${referenceFile}.`);
    if(app.isPackaged)throw new Error("The bundled reference database is missing. Reinstall Tactician's Loom from a complete application package.");
    throw new Error(`Reference database is missing at ${referenceFile}. Run npm run data:build from the tacticians_loom app directory, then run npm start.`);
  }
  const assetRoot=app.isPackaged?process.resourcesPath:path.join(app.getAppPath(),'resources');
  const art=loadAssetFiles(assetRoot);
  protocol.handle('loom-art',request=>{
    const file=resolveAssetRequest(art.files,request.url,request.method);
    return file?net.fetch(pathToFileURL(file).toString()):new Response('Artwork unavailable',{status:404});
  });
  reference = openReference(referenceFile,{allowCandidate:smokeTest});
  if(smokeTest&&!smokeReference&&reference.pragma('user_version',{simple:true})===3)seedExistingSmokeSave(getUserDatabase());
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
  handle(CHANNELS.referenceCatalog,value=>referenceDetails.referenceCatalog(reference!,value));
  handle(CHANNELS.characterLearning,value=>referenceDetails.characterLearning(reference!,value));
  handle(CHANNELS.classRewards,value=>referenceDetails.classRewards(reference!,value));
  handle(CHANNELS.actionReference,value=>referenceDetails.actionReference(reference!,value));
  handle(CHANNELS.characterSocial,value=>referenceDetails.characterSocial(reference!,value));
  handle(CHANNELS.itemReference,value=>referenceDetails.itemReference(reference!,value));
  handle(CHANNELS.locationReference,value=>referenceDetails.locationReference(reference!,value));
  handle(CHANNELS.mapSurfaceReference,value=>referenceDetails.mapSurfaceReference(reference!,value));
  handle(CHANNELS.mapMarkers,value=>referenceDetails.mapMarkers(reference!,value));
  handle(CHANNELS.mapMarkerReference,value=>referenceDetails.mapMarkerReference(reference!,value));
  handle(CHANNELS.referenceEvidence,value=>referenceDetails.referenceEvidence(reference!,value));
  handle(CHANNELS.overview, () => getOverview(reference!));
  handle(CHANNELS.characters, value => {
    if (value !== 'all' && !(ROUTES as readonly unknown[]).includes(value)) throw new Error('Unknown route context');
    return listCharacters(reference!, value as RouteContext);
  });
  handle(CHANNELS.character, value => getCharacter(reference!, validateId(value)));
  handle(CHANNELS.characterClass, value => getClass(reference!, validateId(value)));
  handle(CHANNELS.classLibrary, () => getClassLibrary(reference!));
  handle(CHANNELS.paralogueLibrary, () => getParalogueLibrary(reference!));
  handle(CHANNELS.conflicts, () => getConflicts(reference!));
  handle(CHANNELS.saveSetup, value => {
    const request = z.object({ route: routeContextSchema, setup: setupSchema }).strict().parse(value);
    return saveSetup(getUserDatabase(), request.route, request.setup, getOverview(reference!).datasetVersion);
  });
  handle(CHANNELS.loadSetup, value => loadSetup(getUserDatabase(), routeContextSchema.parse(value)));
  handle(CHANNELS.saveClassSetup, value => saveClassSetup(getUserDatabase(), classSetupSchema.parse(value), getOverview(reference!).datasetVersion));
  handle(CHANNELS.loadClassSetup, () => loadClassSetup(getUserDatabase()));
  handle(CHANNELS.saveParalogueSetup, value => saveParalogueSetup(getUserDatabase(), paralogueSetupSchema.parse(value), getOverview(reference!).datasetVersion));
  handle(CHANNELS.loadParalogueSetup, () => loadParalogueSetup(getUserDatabase()));
  handle(CHANNELS.listCharacterPlanning, () => listCharacterPlanning(getUserDatabase()));
  handle(CHANNELS.setCharacterShortlisted, value => setCharacterShortlisted(getUserDatabase(), setShortlistedRequestSchema.parse(value), getOverview(reference!).datasetVersion));
  handle(CHANNELS.setCharacterNote, value => setCharacterNote(getUserDatabase(), setCharacterNoteRequestSchema.parse(value), getOverview(reference!).datasetVersion));
  handle(CHANNELS.clearCharacterNote, value => clearCharacterNote(getUserDatabase(), validateId(value), getOverview(reference!).datasetVersion));
  const window = createWindow();
  // Bounded integration check uses the actual packaged renderer, preload, IPC and SQLite.
  if (smokeTest) {
    window.webContents.on('console-message', event => console.error('RENDERER:', event.message));
    const timeout = setTimeout(() => { console.error('SMOKE_FAILED: renderer timed out'); app.exit(1); }, 20000);
    window.webContents.once('did-finish-load', async () => {
      try {
        let decodedAssets=0;
        const expanded=reference!.pragma('user_version',{simple:true})===3&&!smokeReference?await window.webContents.executeJavaScript(referenceReleaseSmoke):{};
        if(!smokeReference){
          const images=Object.values(art.manifest.resources).filter(r=>r.file_state==='captured').map(r=>[assetUrl(r.id),r.width,r.height]);
          decodedAssets=await window.webContents.executeJavaScript(`(async()=>{const rows=${JSON.stringify(images)};for(let n=0;n<rows.length;n+=32)await Promise.all(rows.slice(n,n+32).map(([url,width,height])=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth===width&&image.naturalHeight===height?resolve(true):reject(Error('Artwork dimensions differ: '+url));image.onerror=()=>reject(Error('Offline artwork failed: '+url));image.src=url;})));return rows.length;})()`);
        }
        if(app.isPackaged&&reference!.pragma('user_version',{simple:true})===3&&!smokeReference) {
          const mapRoot=path.join(process.resourcesPath,'maps');const manifest=JSON.parse(fs.readFileSync(path.join(mapRoot,'map_manifest.json'),'utf8'));
          for(const asset of manifest.assets) {const file=path.join(mapRoot,path.basename(asset.path));if(!fs.existsSync(file))throw new Error('Packaged map resource missing');}
          if(manifest.assets.filter((a:{tile:unknown})=>a.tile!==null).length!==139)throw new Error('Packaged tile pyramid incomplete');
        }
        const result = await window.webContents.executeJavaScript(smokeReference?referenceV3Smoke:referenceBaselineSmoke);
        if(outboundRequests!==0)throw new Error('Offline smoke attempted an HTTP(S) request');
        console.log('SMOKE_PASSED', JSON.stringify({...result,...expanded,decodedAssets,outboundRequests,httpBlocked:app.isPackaged}));
        clearTimeout(timeout);
        window.destroy();
        closeDatabases();
        app.exit(0);
      } catch (error) { console.error('SMOKE_FAILED', error); clearTimeout(timeout); app.exit(1); }
    });
  }
}).catch(error => {
  console.error(error);
  if (!smokeTest) dialog.showErrorBox("Tactician's Loom could not start", String(error));
  app.exit(1);
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', closeDatabases);
