import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {openReference} from '../src/main/database/reference_queries';
import {actionReference,referenceCatalog,classRewards} from '../src/main/database/reference_details';
import {primaryActionProfile,actionParameterCards} from '../src/shared/action_details';
import {referenceV3Fixture} from './reference_v3_fixture';
import {buildReferenceV3} from '../scripts/reference_v3_builder';
test('combat-art popup returns actual values, zero crit, reported upgrade and exact learners',()=>{
 const db=openReference(path.join(process.cwd(),'database/generated/reference.sqlite'));try{
  const id=referenceCatalog(db,{kind:'action',search:'Wrath Strike'}).rows.find(a=>a.name==='Wrath Strike')!.id,d=actionReference(db,id)!,p=primaryActionProfile(d)!;
  assert.deepEqual(actionParameterCards(p).map(c=>[c.label,c.value]),[['Cost','2'],['Might','4'],['Hit','10'],['Crit','0'],['Range','1']]);
  assert.equal(p.body.effect_text.value,'High Hit.');assert.equal(p.body.upgrade_text.value,'15 Hit');assert.equal(d.learners.length,36);
  const cai=d.learners.find(l=>l.character.id==='cai')!;assert.ok(cai);assert.ok(d.awards.filter(a=>cai.awardIds.includes(a.id)).every(a=>a.body.grade_id==='D'));
 }finally{db.close();}
});
test('popup preserves owner-specific class mastery effects and separates same-name spells',()=>{
 const db=openReference(path.join(process.cwd(),'database/generated/reference.sqlite'));try{
  const rewards=classRewards(db,'bishop')!,mastery=rewards.rewards.find(r=>r.body.label==='Barrier'&&r.body.reward_kind==='mastery')!,d=actionReference(db,mastery.body.action_id)!;
  assert.equal(d.action.actionKind,'ability');assert.equal(primaryActionProfile(d,mastery.id)!.body.effect_text.value,'Grants Res+3 to adjacent allies.');assert.ok(d.classes.some(c=>c.id==='bishop'));
  const spell=referenceCatalog(db,{kind:'action',actionKind:'spell',search:'Barrier'}).rows.find(a=>a.name==='Barrier')!;assert.notEqual(d.action.id,spell.id);
 }finally{db.close();}
});
test('reverse shared learning keeps roster membership scoped rather than granting it to every character',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'loom_action_roster_'));
 try{
  const f=referenceV3Fixture(root),id='fixture:ability';
  f.add('identity','entities','entity:fixture:ability',{id,kind:'ability',display_name:'Fixture ability',identity_state:'identified',namespace:'ability',retired:0});
  f.add('combat','actions','action:fixture:ability',{id,action_kind:'ability',skill_id:'swords',profile_record_id:'profile:fixture:ability'},id);
  const profile=f.add('combat','action_profiles','profile:fixture:ability',{action_id:id,parameters_json:{}},id);
  for(const key of ['effect_text','damage_type','equipment_restriction_text','upgrade_text'])f.fact(profile,key,null,'source_missing');
  f.add('identity','source_bindings','binding:fixture:cai',{id:'binding:fixture:cai',document_id:'fixture_source',pointer:'/DATA/characters/0/name',entity_id:'cai',resolution:'mapped',external_key:null,rationale:'Explicit fixture roster membership.'});
  f.add('combat','learning_rules','rule:fixture:shared',{scope:'captured_source_roster_shared',source_roster_capture_id:'fixture',skill_id:'swords',rule_completeness:'partial'});
  f.add('combat','learning_awards','award:fixture:shared',{rule_id:'rule:fixture:shared',character_id:null,acquired_entity_id:id,acquired_label:'Fixture ability',skill_id:'swords',grade_id:'C',acquisition_kind:'shared_skill_rank',level_value:null,active_at_start:null,condition_id:null,applicability:'source_roster_scoped'});
  f.write('test.popup','reviewed');const file=path.join(root,'reference.sqlite');buildReferenceV3(root,file);const db=openReference(file);
  try{assert.deepEqual(actionReference(db,id)!.learners.map(l=>l.character.id),['cai']);assert.ok(db.prepare("SELECT id FROM characters WHERE id='leda'").get());}finally{db.close();}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
