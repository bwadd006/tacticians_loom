import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { referenceV3Fixture } from './reference_v3_fixture';
import { buildReferenceV3, validateReferenceV3, recordDiff } from '../scripts/reference_v3_builder';
import { loadReferenceV3, sha256 } from '../scripts/reference_v3_sources';
import { buildDatabase } from '../scripts/database_builder';
import { getCharacter, getClassLibrary, getParalogueLibrary, getOverview, listCharacters, openReference, metadata } from '../src/main/database/reference_queries';
import { loadSqlite } from '../src/main/database/sqlite';
import { affinity } from '../src/shared/library_query';
import { fieldSchema, quantitySchema, canonicalDocumentSchema, TABLE_CONTRACTS, bodySchema } from '../src/shared/reference_v3';
import { openUserDatabase, setCharacterNote, setCharacterShortlisted, listCharacterPlanning } from '../src/main/database/user_database';
import retainedIds from '../data/contracts/retained_core_ids.json';
import { sourceQuantity, resolveSourceLabel, sourceShopLayer } from '../src/shared/reference_v3_transforms';

function fixture(run:(root:string,data:ReturnType<typeof referenceV3Fixture>,output:string)=>void) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'loom_v3_test_'));
  try {run(root,referenceV3Fixture(root),path.join(root,'candidate.sqlite'));}
  finally {fs.rmSync(root,{recursive:true,force:true});}
}
test('v3 builds normalized selected facts, preserves all 132 IDs and keeps candidates isolated',()=>fixture((root,_,output)=>{
  assert.throws(()=>buildDatabase(root),/separate output/);
  const result=buildDatabase(root,output);assert.equal(result.validation,'passed');
  assert.throws(()=>openReference(output),/Unreviewed candidate/);
  const db=openReference(output,{allowCandidate:true});try {
    assert.equal(validateReferenceV3(db).validation,'passed');
    assert.equal(db.pragma('user_version',{simple:true}),3);
    assert.equal((db.prepare('SELECT count(*) n FROM entities').get() as {n:number}).n,132);
    assert.equal(metadata(db,'release_status'),'candidate');
  }finally{db.close();}
}));
test('v3 library adapters preserve zero, partial affinities, grouped certification and unlabeled timing',()=>fixture((root,_,output)=>{
  buildReferenceV3(root,output);const db=openReference(output,{allowCandidate:true});try {
    const c=getCharacter(db,'cai')!;
    assert.equal(c.growth_rates_percent.hp,0);assert.equal(c.growth_rates_percent.magic,null);
    assert.equal(c.recruitment_by_route.cai.earliest_chapter,0);assert.equal(c.recruitment_by_route.cai.min_renown,null);
    assert.equal(c.recruitment_by_route.dietrich.status,'unknown');
    assert.equal(affinity(c,'swords'),'boon');assert.equal(affinity(c,'axes'),'unknown');
    assert.deepEqual(listCharacters(db,'all').map(c=>c.id),['cai']);assert.deepEqual(listCharacters(db,'cai').map(c=>c.id),['cai']);
    assert.deepEqual(listCharacters(db,'leda'),[]);assert.equal(getCharacter(db,'leda')!.flags.recruitable_or_joins_in_part_1,false);
    const cls=getClassLibrary(db).classes[0];assert.equal(cls.skill_exp_bonuses.swords,0);assert.equal(cls.playable,null);
    assert.equal(cls.certification.listed_level,20);assert.equal(cls.certification.exact_minimum_level,null);
    assert.equal(cls.certification.reported_requirements?.summary,'All of (swords C)');assert.equal(cls.weapon_access.verified,false);
    const para=getParalogueLibrary(db).paralogues[0];assert.equal(para.name,'Cai — paralogue');
    assert.deepEqual(para.route_availability.cai.acceptance_windows,[]);assert.equal(para.route_availability.cai.listed_completion_deadline,null);
    assert.equal(para.route_availability.cai.reported_timing?.[0].role,'source_span');assert.equal(para.route_availability.leda.status,'unknown');
    assert.equal(getOverview(db).actOneCount,1);
  }finally{db.close();}
}));
test('closed source contracts reject unknown versions/keys and expose every normalized table contract',()=>fixture((root,data)=>{
  for(const kind of Object.keys(TABLE_CONTRACTS) as (keyof typeof TABLE_CONTRACTS)[]) assert.doesNotThrow(()=>bodySchema(kind));
  assert.throws(()=>canonicalDocumentSchema.parse({format_version:'9',family:'characters',capture_ids:[],records:[]}));
  data.record('class:commoner').body.unreviewed=true;data.write();assert.throws(()=>loadReferenceV3(root),/Unrecognized key/);
}));
test('value contracts distinguish false/empty/null/missing and reject invented exact quantities',()=>{
  const known=(value:unknown)=>({state:'value',value,claim_ids:['c'],selected_claim_id:'c',reason:null});
  for(const value of [0,false,[],{},'']) assert.deepEqual(fieldSchema(z.unknown()).parse(known(value)).value,value);
  assert.throws(()=>fieldSchema(z.unknown()).parse(known(null)));
  const quantity={raw:'2?',state:'value',number:null,lower:null,upper:null,unit:null,qualifier:'uncertain'};
  assert.equal(quantitySchema.parse(quantity).number,null);
  assert.throws(()=>quantitySchema.parse({...quantity,number:2}));
  assert.throws(()=>quantitySchema.parse({...quantity,qualifier:'range'}));

});
test('changed maintained bytes fail without replacing the database',()=>fixture((root,_,output)=>{
 buildReferenceV3(root,output);const before=sha256(fs.readFileSync(output));
 fs.appendFileSync(path.join(root,'data/source/characters.json'),' ');
 assert.throws(()=>buildReferenceV3(root,output),/Maintained document hash/);assert.equal(sha256(fs.readFileSync(output)),before);
}));
test('same-version changes fail; next version produces a selected-source field diff',()=>fixture((root,data,output)=>{
  buildReferenceV3(root,output);const before=sha256(fs.readFileSync(output));
  data.record('growth:cai:hp').body.number_value={state:'value',value:10,claim_ids:['claim:growth:cai:hp:number_value'],selected_claim_id:'claim:growth:cai:hp:number_value',reason:null};
  data.record('row:claim:growth:cai:hp:number_value').body.value_json=10;data.raw['growth:cai:hp:number_value']=10;data.write();
  assert.throws(()=>buildReferenceV3(root,output),/bump dataset_version/);assert.equal(sha256(fs.readFileSync(output)),before);
  data.write('test.2');const result=buildReferenceV3(root,output);
  assert.ok(result.changeReport.fields.some(f=>f.record_id==='growth:cai:hp'&&f.field_path==='/number_value'&&f.status==='selected_value_changed'));
  const db=openReference(output,{allowCandidate:true});try{assert.equal(getCharacter(db,'cai')!.growth_rates_percent.hp,10);assert.equal(metadata(db,'previous_release_inputs'),null);}finally{db.close();}
}));
test('legacy claims cannot be selected and claim values must justify selected facts',()=>fixture((root,data,output)=>{
  const claim=data.record('row:claim:growth:cai:hp:number_value');claim.body.origin='legacy';data.write();
  assert.throws(()=>buildReferenceV3(root,output),/Legacy\/supplemental/);
  claim.body.origin='preferred_source';claim.body.value_json=12;data.write();assert.throws(()=>buildReferenceV3(root,output),/Unevidenced transform/);
}));
test('cross-record claims are rejected',()=>fixture((root,data,output)=>{
  data.record('row:claim:growth:cai:hp:number_value').body.record_id='class:commoner';data.write();
  assert.throws(()=>buildReferenceV3(root,output),/another record/);
}));
test('condition cycles and contradictory route scope fail validation',()=>fixture((root,data,output)=>{
  data.add('context','condition_children','cycle',{parent_id:'grade',child_id:'and',display_order:0});
  data.record('condition:grade').body.node_kind='all';data.record('condition:grade').body.value_json={kind:'group'};data.write();
  assert.throws(()=>buildReferenceV3(root,output),/Condition cycle/);
  data.groups.get('context')!.splice(data.groups.get('context')!.findIndex(r=>r.id==='cycle'),1);
  data.record('ctx:act1').body.route_scope='unknown';data.write();assert.throws(()=>buildReferenceV3(root,output),/route scope/);
}));
test('wrong entity kinds, dangling IDs and removed identities are rejected',()=>fixture((root,data,output)=>{
  buildReferenceV3(root,output);
  data.record('entity:cai').body.kind='class';data.write('test.2');assert.throws(()=>buildReferenceV3(root,output),/Wrong entity kind/);
  data.record('entity:cai').body.kind='character';data.record('recruit:cai').body.character_id='absent';data.write('test.2');assert.throws(()=>buildReferenceV3(root,output),/Dangling/);
}));
test('SQL failure after candidate creation preserves the last good database and cleans temporary output',()=>fixture((root,data,output)=>{
  buildReferenceV3(root,output);const before=sha256(fs.readFileSync(output));
  // Both rows have valid individual contracts; their duplicate domain key fails inside the transaction.
  const original=data.record('class_skill:commoner:swords');data.add('classes','class_skills','duplicate_training',{...original.body},'commoner');
  // No selected fields on duplicate: use unknown fields so field-claim ownership remains valid.
  const duplicate=data.record('duplicate_training');
  for(const key of ['training_bonus','access_state']) duplicate.body[key]={state:'source_missing',value:null,claim_ids:[],selected_claim_id:null,reason:'Not established'};
  duplicate.body.access_claim_id=null;data.write('test.2');
  assert.throws(()=>buildReferenceV3(root,output),/UNIQUE constraint/);assert.equal(sha256(fs.readFileSync(output)),before);
  assert.deepEqual(fs.readdirSync(root).filter(p=>p.endsWith('.tmp')),[]);
}));
test('validation detects normalized-column tampering and preserves claim immutability',()=>fixture((root,_,output)=>{
  buildReferenceV3(root,output);const Sqlite=loadSqlite(),db=new Sqlite(output);try{
    assert.throws(()=>db.prepare("UPDATE source_claims SET origin='legacy'").run(),/immutable/);
    db.prepare("UPDATE stat_values SET number_value=99 WHERE stat_id='hp'").run();
    assert.throws(()=>validateReferenceV3(db),/column\/body mismatch/);
  }finally{db.close();}
}));
test('reviewed release opens normally and saved IDs outside Act 1 survive reference changes',()=>fixture((root,data,output)=>{
  data.write('reviewed.1','reviewed');buildReferenceV3(root,output);const reference=openReference(output);
  const user=openUserDatabase(path.join(root,'player.sqlite'));try{
    for(const entry of retainedIds.filter(e=>e.kind==='character')) {setCharacterShortlisted(user,{characterId:entry.id,shortlisted:true},'old');setCharacterNote(user,{characterId:entry.id,note:`Retained ${entry.id}`},'old');}
    assert.equal(user.pragma('user_version',{simple:true}),4);
    const before=listCharacterPlanning(user);assert.equal(before.length,63);
    assert.equal(listCharacters(reference,'all').length,1);assert.deepEqual(listCharacterPlanning(user),before);
    assert.ok(before.some(r=>r.characterId==='leda'&&r.shortlisted));
  }finally{user.close();reference.close();}
}));
test('maintained document paths cannot escape through traversal or symlinks',()=>fixture((root)=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/dataset_manifest.json'),'utf8'));
  manifest.documents[0].path='../outside.json';fs.writeFileSync(path.join(root,'data/dataset_manifest.json'),JSON.stringify(manifest));
  assert.throws(()=>loadReferenceV3(root),/application-relative/);
  const outside=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'loom_outside_')),'identity.json');
  try {
    fs.copyFileSync(path.join(root,'data/source/identity.json'),outside);
    fs.symlinkSync(outside,path.join(root,'data/source/link.json'));
    manifest.documents[0].path='data/source/link.json';fs.writeFileSync(path.join(root,'data/dataset_manifest.json'),JSON.stringify(manifest));
    assert.throws(()=>loadReferenceV3(root),/escapes/);
  }finally{fs.rmSync(path.dirname(outside),{recursive:true,force:true});}
}));
test('field diffs retain semantic gaps and legacy alternatives',()=>{
  const record={id:'test',record_kind:'annotations' as const,entity_id:null,context_id:null,body:{text:{state:'source_missing',value:null,claim_ids:[],selected_claim_id:null,reason:'Source omits text'}}};
  const next=structuredClone(record);next.body.text.state='unresolved';next.body.text.reason='Source semantics unclear';
  const report=recordDiff([record],[next]);assert.equal(report.fields[0].status,'unresolved_semantics');
});
test('lexical quantities and inventory transforms preserve uncertainty and field-wise empty replacements',()=>{
  assert.equal(sourceQuantity('2?',null).number,null);assert.equal(sourceQuantity('28+10','stat_points').number,null);
  assert.equal(sourceQuantity('0','gold').number,0);assert.equal(sourceQuantity('',null).number,null);
  assert.equal(sourceQuantity('Unlimited',null).qualifier,'unlimited');assert.deepEqual([sourceQuantity('1–3',null).lower,sourceQuantity('1–3',null).upper],[1,3]);
  const base={sh:['Armory'],shn:['Base note'],sp:{Armory:[['Sword','']]}};
  const result=sourceShopLayer(base,{sh:[],sp:{}});assert.deepEqual(result.effective,{sh:[],shn:['Base note'],sp:{}});
  assert.equal(result.states.sh,'replaced');assert.equal(result.states.shn,'inherited');
  assert.throws(()=>sourceShopLayer(base,{unreviewed:[]}));
  const entities=[{id:'ability:barrier',kind:'ability',display_name:'Barrier'},{id:'spell:barrier',kind:'spell',display_name:'Barrier'}];
  assert.equal(resolveSourceLabel('Barrier','spell',entities,[]).target_id,'spell:barrier');
  assert.equal(resolveSourceLabel('Missing','spell',entities,[]).state,'unresolved');
  assert.equal(resolveSourceLabel('Barrier','spell',[...entities,{id:'other',kind:'spell',display_name:'Barrier'}],[]).state,'ambiguous');
});
test('normalized table contracts match the v3 SQL schema exactly',()=>{
  const Sqlite=loadSqlite(),db=new Sqlite(':memory:');try{
    db.exec(fs.readFileSync(path.join(process.cwd(),'database/reference_schema_v3.sql'),'utf8'));
    for(const [table,contract] of Object.entries(TABLE_CONTRACTS)) {
      const actual=db.pragma(`table_info("${table}")`) as {name:string;type:string;notnull:number;pk:number}[];
      assert.deepEqual(contract.columns,actual.map(c=>({name:c.name,type:c.type,nullable:!c.notnull,primary:!!c.pk})),table);
    }
  }finally{db.close();}
});
test('removed custom identities require tombstones across releases',()=>fixture((root,data,output)=>{
  data.add('identity','entities','entity:custom',{id:'custom',kind:'person',display_name:'A source subject',namespace:'person',identity_state:'name_only',retired:0});
  data.write();buildReferenceV3(root,output);
  const identity=data.groups.get('identity')!;identity.splice(identity.findIndex(r=>r.id==='entity:custom'),1);data.write('test.2');
  assert.throws(()=>buildReferenceV3(root,output),/tombstone/);
  data.add('identity','entities','entity:custom',{id:'custom',kind:'person',display_name:'A source subject',namespace:'person',identity_state:'name_only',retired:1});
  data.write('test.2');assert.equal(buildReferenceV3(root,output).validation,'passed');
}));
test('registered numeric transforms are reproducible and repeated builds do not duplicate release history',()=>fixture((root,data,output)=>{
  const value=data.record('growth:cai:hp').body.number_value as {value:number};value.value=10;
  const claim=data.record('row:claim:growth:cai:hp:number_value');claim.body.value_json='10';claim.body.semantic_role='numeric_lexeme';data.raw['growth:cai:hp:number_value']='10';data.write();
  buildReferenceV3(root,output);buildReferenceV3(root,output);
  const db=openReference(output,{allowCandidate:true});try{assert.equal(getCharacter(db,'cai')!.growth_rates_percent.hp,10);assert.equal(metadata(db,'previous_release_inputs'),null);}finally{db.close();}
  value.value=99;data.write('test.2');assert.throws(()=>buildReferenceV3(root,output),/Unevidenced transform/);
}));
test('legacy alternatives survive a full round trip without changing preferred baseline selections',()=>fixture((root,data,output)=>{
  data.addLegacy();data.write();const result=buildReferenceV3(root,output);
  assert.equal(result.changeReport.counts.legacy_claims,1);
  const selected=result.changeReport.selected.find(s=>s.record_id==='growth:cai:hp'&&s.field_path==='/number_value')!;
  assert.equal(selected.value,0);assert.equal(selected.alternatives[0].value_json,47);
  const db=openReference(output,{allowCandidate:true});try{
    assert.equal(getCharacter(db,'cai')!.growth_rates_percent.hp,0);
    assert.equal((db.prepare("SELECT value_json FROM source_claims WHERE id='legacy_growth'").get() as {value_json:string}).value_json,'47');
    assert.equal(validateReferenceV3(db).validation,'passed');
  }finally{db.close();}
}));
test('unknown or incompatible stat units cannot enter numeric growth comparisons',()=>fixture((root,data,output)=>{
  data.record('growth:cai:hp').body.unit='unknown';data.write();buildReferenceV3(root,output);
  const db=openReference(output,{allowCandidate:true});try{assert.equal(getCharacter(db,'cai')!.growth_rates_percent.hp,null);}finally{db.close();}
  data.record('growth:cai:hp').body.unit='unreviewed_currency';data.write('test.2');assert.throws(()=>buildReferenceV3(root,output),/Invalid option/);
}));
