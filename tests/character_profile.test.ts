import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {openReference} from '../src/main/database/reference_queries';
import {characterProfile} from '../src/main/database/character_profile';
import {referenceCatalog} from '../src/main/database/reference_details';
import {openUserDatabase,loadCharacterProfilePreference,saveCharacterProfilePreference,setCharacterNote,listCharacterPlanning} from '../src/main/database/user_database';
import {resolveProfileCharacter,statObservationText,conditionText,factText} from '../src/shared/character_profile_query';
import {detailRecordSchemas} from '../src/shared/reference_details';
test('all catalog characters have closed complete profile contracts independently of Act 1',()=>{
 const db=openReference(path.join(process.cwd(),'database/generated/reference.sqlite'));try{
  const catalog=referenceCatalog(db,{kind:'character',limit:100}).rows;assert.equal(catalog.length,63);
  for(const c of catalog){const p=characterProfile(db,c.id)!;assert.equal(p.character.id,c.id);assert.equal(p.statProfiles.filter(s=>s.body.role==='personal_growth').length,1);assert.ok(p.initialSkills.length>0);for(const s of p.statValues)assert.ok(detailRecordSchemas.stat_values.safeParse(s).success);}
  assert.equal(characterProfile(db,'commoner'),null);assert.equal(characterProfile(db,'absent'),null);assert.throws(()=>characterProfile(db,"\0"));
  assert.equal(resolveProfileCharacter(catalog,null),'alexandra');assert.equal(resolveProfileCharacter(catalog,'eshmel'),'eshmel');assert.equal(resolveProfileCharacter(catalog,'retired'), 'alexandra');
 }finally{db.close();}
});
test('profile preserves unadjusted-base uncertainty, expressions, conditional growths and story-scoped recruitment',()=>{
 const db=openReference(path.join(process.cwd(),'database/generated/reference.sqlite'));try{
  const cai=characterProfile(db,'cai')!;assert.equal(cai.crests.length,2);assert.ok(cai.blaze.length>0);assert.ok(cai.recruitment.some(r=>cai.contexts.find(c=>c.id===r.context_id)?.part===3));assert.equal(cai.movement[0].value.value,4);
  assert.ok(cai.statProfiles.some(p=>p.body.role==='displayed_base_observation'&&p.body.interpretation_state==='unadjusted_personal_base_unresolved'));
  const mu=characterProfile(db,'mu')!;assert.ok(mu.statProfiles.some(s=>s.body.role==='conditional_growth_adjustment'));
  const eshmel=characterProfile(db,'eshmel')!,dex=eshmel.statValues.find(s=>s.body.expression_text.value==='28+10');assert.ok(dex);assert.equal(dex.body.number_value.value,null);assert.equal(statObservationText(dex),'28+10');
  assert.ok(cai.recruitment.some(r=>r.body.join_kind.value==='automatic'&&r.body.renown_value.value===null));
  assert.ok(!('sql' in cai)&&!('sourceDocuments' in cai));
 }finally{db.close();}
});
test('last character preference migrates schema-4 saves, persists unresolved IDs and rejects arbitrary input',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'loom_profile_saves_')),file=path.join(root,'player.sqlite');
 try{let db=openUserDatabase(file);setCharacterNote(db,{characterId:'unresolved_character',note:'Keep this note'},'old');db.exec('DROP TABLE map_preference; DROP TABLE character_profile_preference; PRAGMA user_version=4');const before=listCharacterPlanning(db);db.close();db=openUserDatabase(file);
  assert.equal(db.pragma('user_version',{simple:true}),6);assert.deepEqual(listCharacterPlanning(db),before);assert.equal(loadCharacterProfilePreference(db),null);
  saveCharacterProfilePreference(db,{characterId:'eshmel'});saveCharacterProfilePreference(db,{characterId:'unresolved_saved_character'});assert.equal(db.prepare('SELECT count(*) FROM character_profile_preference').pluck().get(),1);
  for(const value of [{characterId:''},{characterId:'cai',sql:'DELETE'},{characterId:'\0'},null])assert.throws(()=>saveCharacterProfilePreference(db,value));db.close();db=openUserDatabase(file);assert.deepEqual(loadCharacterProfilePreference(db),{characterId:'unresolved_saved_character'});assert.deepEqual(listCharacterPlanning(db),before);db.close();
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('pure profile displays preserve zero, empty catalogs and unresolved condition references',()=>{
 assert.equal(factText({state:'value',value:0,claim_ids:['test'],selected_claim_id:'test',reason:null}),'0');
 assert.equal(resolveProfileCharacter([],null),null);assert.equal(conditionText({contexts:[],conditions:[]},'missing'),'Condition not documented');
});
