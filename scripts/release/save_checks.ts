import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import retained from '../../data/contracts/retained_core_ids.json';
import { openUserDatabase,loadSetup,loadClassSetup,loadParalogueSetup,listCharacterPlanning,setCharacterNote,setCharacterShortlisted } from '../../src/main/database/user_database';
import { defaultSetup,setupIssues } from '../../src/shared/library_setup';
import { defaultClassSetup } from '../../src/shared/class_library_setup';
import { defaultParalogueSetup } from '../../src/shared/paralogue_library_setup';
import { getCharacter } from '../../src/main/database/reference_queries';
import { ROUTES } from '../../src/shared/catalog';

const oldVersion='2026.10.25.2',savedAt='2026-10-26T12:34:56.000Z';
export function validateSavedDataCompatibility(reference:Database.Database) {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'loom_save_upgrade_')),versions=[];
 const tableVersions={library_setups:1,class_library_setup:2,character_planning:3,paralogue_library_setup:4};
 try {
  for(const version of [1,2,3,4]) {
   const file=path.join(directory,`schema_${version}.sqlite`);let player=openUserDatabase(file);
   try {
    for(const route of ['all',...ROUTES]){const setup={...defaultSetup(),filters:[{kind:'number' as const,field:'future_stat',min:0,max:null,unknown:'include' as const}],sorts:[{field:route==='all'?'future_sort':'earliest_chapter',direction:'asc' as const},{field:'name',direction:'asc' as const}]};player.prepare('INSERT INTO library_setups VALUES (?,?,?,?)').run(route,JSON.stringify(setup),savedAt,oldVersion);}
    player.prepare('INSERT INTO class_library_setup VALUES (1,?,?,?)').run(JSON.stringify({...defaultClassSetup(),tiers:[...defaultClassSetup().tiers,'future_tier']}),savedAt,oldVersion);
    player.prepare('INSERT INTO paralogue_library_setup VALUES (1,?,?,?)').run(JSON.stringify({...defaultParalogueSetup(),filters:[{kind:'associated_character',characterId:'unresolved_saved_character'}]}),savedAt,oldVersion);
    for(const {id}of retained.filter(e=>e.kind==='character')){setCharacterNote(player,{characterId:id,note:`Preserve ${id} — player choice`},oldVersion);setCharacterShortlisted(player,{characterId:id,shortlisted:id!=='cai'},oldVersion);}
    setCharacterNote(player,{characterId:'unresolved_saved_character',note:'Unresolved ID remains a player choice'},oldVersion);
    for(const [table,schema]of Object.entries(tableVersions))if(schema>version)player.exec(`DROP TABLE ${table}`);
    player.pragma(`user_version = ${version}`);
    const snapshot=Object.fromEntries(Object.entries(tableVersions).filter(([,schema])=>schema<=version).map(([table])=>[table,player.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
    player.close();player=openUserDatabase(file);assert.equal(player.pragma('user_version',{simple:true}),4);
    for(const [table,rows]of Object.entries(snapshot))assert.deepEqual(player.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),rows,`Schema-${version} save changed ${table}`);
    for(const route of ['all',...ROUTES] as const){const loaded=loadSetup(player,route)!;assert.equal(loaded.savedAt,savedAt);assert.equal(loaded.datasetVersion,oldVersion);assert.ok(setupIssues(loaded.setup,route).some(i=>i.includes('future_')));if(route!=='all')assert.equal(loaded.setup.sorts[0].field,`recruitment:${route}:earliest_chapter`);}
    if(version>=2){assert.ok(loadClassSetup(player)!.setup.tiers.includes('future_tier'));assert.equal(loadClassSetup(player)!.savedAt,savedAt);}
    if(version>=3){const planning=listCharacterPlanning(player);assert.equal(planning.length,64);assert.ok(planning.some(p=>p.characterId==='eshmel'&&p.shortlisted));assert.ok(planning.some(p=>p.characterId==='cai'&&!p.shortlisted&&p.note));assert.ok(planning.some(p=>p.characterId==='unresolved_saved_character'));for(const {id}of retained.filter(e=>e.kind==='character'))assert.ok(getCharacter(reference,id));}
    if(version>=4){assert.equal(loadParalogueSetup(player)!.savedAt,savedAt);assert.deepEqual(loadParalogueSetup(player)!.setup.filters,[{kind:'associated_character',characterId:'unresolved_saved_character'}]);}
    // Reads and legacy identifier normalization must not rewrite saved JSON/timestamps.
    for(const [table,rows]of Object.entries(snapshot))assert.deepEqual(player.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),rows);
    versions.push({from:version,to:4,preservedTables:Object.keys(snapshot),status:'passed'});
   }finally{if(player.open)player.close();}
  }
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
 return {status:'passed',versions,retainedCharacterIds:63,unresolvedIdsPreserved:true,realUserDataOpened:false};
}
