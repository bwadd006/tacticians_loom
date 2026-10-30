import fs from 'node:fs';
import path from 'node:path';
import retainedIds from '../data/contracts/retained_core_ids.json';
import { ROUTES } from '../src/shared/catalog';
import type { CanonicalRecord, CanonicalDocument, Field, RecordKind } from '../src/shared/reference_v3';
import { sha256, escapePointer } from '../scripts/reference_v3_sources';

export function referenceV3Fixture(root: string) {
  fs.mkdirSync(path.join(root,'data/source'),{recursive:true});
  fs.mkdirSync(path.join(root,'database'),{recursive:true});
  fs.copyFileSync(path.join(process.cwd(),'database/reference_schema_v3.sql'),path.join(root,'database/reference_schema_v3.sql'));
  const groups = new Map<CanonicalDocument['family'],CanonicalRecord[]>();
  const raw: Record<string,unknown> = {};
  const add = (family:CanonicalDocument['family'],kind:RecordKind,id:string,body:Record<string,unknown>,entity:string|null=null,context:string|null=null) => {
    const record:CanonicalRecord={id,record_kind:kind,entity_id:entity,context_id:context,body};
    if(!groups.has(family)) groups.set(family,[]); groups.get(family)!.push(record);return record;
  };
  for(const entity of retainedIds) add('identity','entities',`entity:${entity.id}`,{id:entity.id,kind:entity.kind,display_name:entity.id,identity_state:'identified',namespace:entity.kind,retired:0});
  const fact = (record:CanonicalRecord,column:string,value:unknown,state:Field<unknown>['state']=value===null?'source_null':'value'):Field<unknown> => {
    const key=`${record.id}:${column}`, claimId=`claim:${key}`, pointer=`/${escapePointer(key)}`;
    if(state!=='source_missing') raw[key]=value;
    add('evidence','source_claims',`row:${claimId}`,{id:claimId,record_id:record.id,field_path:`/${escapePointer(column)}`,document_id:'fixture_source',source_pointer:pointer,origin:'preferred_source',evidence_state:'reported',value_state:state,value_json:state==='source_missing'?null:value,semantic_role:'observation',context_id:record.context_id});
    const field:Field<unknown>={state,value:state==='value'?value:null,claim_ids:[claimId],selected_claim_id:['value','source_null'].includes(state)?claimId:null,reason:['value','source_null'].includes(state)?null:'Fixture source does not establish this field'};
    record.body[column]=field; return field;
  };
  for(const route of ROUTES) add('context','routes',`route:${route}`,{id:route,display_name:route});
  add('context','stats','stat:hp',{id:'hp',label:'HP',display_order:0});
  add('context','skills','skill:swords',{id:'swords',label:'Sword',display_order:0});
  add('context','grades','grade:C',{id:'C',label:'C',ordering:4,meaning_state:'reported'});
  add('context','class_tiers','tier:beginner',{id:'beginner',label:'Beginner',display_order:1});
  add('context','contexts','ctx:act1',{id:'act1',label:'Cai Act 1',route_scope:'listed',part:1,part_state:'specified',chapter_low:0,chapter_high:10,section_text:null,difficulty_text:null,condition_root_id:null});
  add('context','context_routes','ctxroute:cai',{context_id:'act1',route_id:'cai'});
  add('context','contexts','ctx:part3',{id:'part3',label:'Part III',route_scope:'unknown',part:3,part_state:'specified',chapter_low:null,chapter_high:null,section_text:null,difficulty_text:null,condition_root_id:null});
  for(const id of ['cai','leda']) {
    add('characters','people',`person:${id}`,{id,subject_context:'source_roster'});
    add('characters','characters',`character:${id}`,{id,person_id:id,roster_membership_record_id:`character:${id}`},id);
  }
  const growth=add('characters','stat_profiles','growth:cai',{owner_id:'cai',role:'personal_growth',level_low:null,level_high:null,level_text:null,class_id:null,modifier_source_id:null,interpretation_state:'selected'},'cai');
  const hp=add('characters','stat_values','growth:cai:hp',{profile_id:growth.id,stat_id:'hp',unit:'percent',value_state:'value'},'cai');fact(hp,'number_value',0);fact(hp,'expression_text',null,'source_missing');
  const initial=add('characters','initial_skills','initial:cai:swords',{character_id:'cai',skill_id:'swords',grade_state:'source_missing',affinity_state:'value'},'cai');fact(initial,'grade_id',null,'source_missing');fact(initial,'affinity','boon');
  for(const id of ['cai','leda']) {
    const event=add('characters','recruitment_events',`recruit:${id}`,{character_id:id,condition_id:null,event_scope_state:'reported'},id,id==='cai'?'act1':'part3');
    fact(event,'join_kind','automatic');fact(event,'chapter_value',0);fact(event,'renown_value',null);fact(event,'support_value',null,'source_missing');fact(event,'when_text','');
  }
  add('classes','classes','class:commoner',{id:'commoner',tier_id:'beginner',identity_record_id:'class:commoner'},'commoner');
  const profile=add('classes','class_profiles','profile:commoner',{class_id:'commoner',mount_species_id:null},'commoner');
  fact(profile,'movement_value',4);fact(profile,'movement_types_json',[]);fact(profile,'examples_text','');
  const training=add('classes','class_skills','class_skill:commoner:swords',{class_id:'commoner',skill_id:'swords',listing_state:'reported',access_evidence:'reported',access_claim_id:'claim:class_skill:commoner:swords:access_state'},'commoner');
  fact(training,'training_bonus',0);fact(training,'access_state','reported');
  add('context','conditions','condition:grade',{id:'grade',node_kind:'leaf',predicate:'skill_grade',subject_id:null,object_id:null,value_json:{kind:'skill_grade',skill_id:'swords',grade_id:'C'},claim_id:null});
  add('context','conditions','condition:and',{id:'and',node_kind:'all',predicate:null,subject_id:null,object_id:null,value_json:{kind:'group'},claim_id:null});
  add('context','condition_children','condition_child:grade',{parent_id:'and',child_id:'grade',display_order:0});
  const certification=add('classes','class_certifications','cert:commoner',{class_id:'commoner',license_id:null,license_item_id:null,grade_root_id:'and',completeness:'partial',probability_formula_id:null},'commoner');
  fact(certification,'listed_level',20);fact(certification,'listed_renown',null,'source_missing');fact(certification,'exclusivity_text',null,'source_missing');fact(certification,'restriction_text',null,'source_missing');
  const para=retainedIds.find(e=>e.kind==='paralogue')!.id;
  add('paralogues','activities',`activity:${para}`,{id:para,activity_kind:'paralogue',profile_record_id:`paralogue:${para}`},para);
  add('paralogues','paralogues',`paralogue:${para}`,{id:para,associated_person_id:'cai',source_label:'Cai',source_title:null,title_state:'source_missing'},para);
  const available=add('paralogues','activity_availability','available:para',{activity_id:para,condition_id:null},para,'act1');fact(available,'availability_state','available');
  const time=add('context','time_assertions','time:para',{owner_record_id:available.id,timing_role:'source_span',calendar_id:'game',semantics_state:'unresolved',source_order:0},para,'act1');
  fact(time,'start_month',6);fact(time,'start_day',1);fact(time,'end_month',6);fact(time,'end_day',2);fact(time,'time_text',null);fact(time,'deadline_turns',null,'source_missing');fact(time,'timing_text','6/1–6/2');
  const capture=add('evidence','captures','capture:fixture',{id:'fixture',source_url:'https://fixture.invalid/',captured_at:'2026-10-29T00:00:00Z',manifest_sha256:'',source_role:'preferred'});
  const source=add('evidence','source_documents','document:fixture',{id:'fixture_source',capture_id:'fixture',source_url:'https://fixture.invalid/data.json',sha256:'',media_type:'application/json',body:null,relative_path:'raw.json'});
  function addLegacy(value=47) {
    add('evidence','captures','capture:legacy',{id:'legacy',source_url:'https://legacy.invalid/',captured_at:'2026-10-25T00:00:00Z',manifest_sha256:sha256('legacy'),source_role:'legacy'});
    add('evidence','source_documents','document:legacy',{id:'legacy_source',capture_id:'legacy',source_url:'https://legacy.invalid/data.json',sha256:sha256('legacy'),media_type:'application/json',body:null,relative_path:null});
    add('evidence','source_claims','row:legacy_growth',{id:'legacy_growth',record_id:'growth:cai:hp',field_path:'/number_value',document_id:'legacy_source',source_pointer:'/hp',origin:'legacy',evidence_state:'reported',value_state:'value',value_json:value,semantic_role:'observation',context_id:null});
    (hp.body.number_value as Field<unknown>).claim_ids.push('legacy_growth');
  }
  function write(version='test.1',status:'candidate'|'reviewed'='candidate') {
    source.body.sha256=sha256(JSON.stringify(raw));source.body.body=null;source.body.relative_path=null;capture.body.manifest_sha256=sha256('fixture');
    const documents=[...groups].map(([family,records])=>{
      const text=JSON.stringify({format_version:'2.0.0',family,capture_ids:groups.get('evidence')!.filter(r=>r.record_kind==='captures').map(r=>r.body.id),records});const relative=`data/source/${family}.json`;
      fs.writeFileSync(path.join(root,relative),text);return {family,path:relative,format_version:'2.0.0',sha256:sha256(text)};
    });
    const manifest={manifest_version:'2.0.0',dataset_version:version,change_summary:'Synthetic importer fixture; no production gameplay import',reference_schema_version:3,importer_version:'3.3.0',release_status:status,documents,
      identity_registry_sha256:documents.find(d=>d.family==='identity')!.sha256};
    fs.writeFileSync(path.join(root,'data/dataset_manifest.json'),JSON.stringify(manifest));
  }
  write();return {groups,raw,add,fact,write,addLegacy,para,record:(id:string)=>[...groups.values()].flat().find(r=>r.id===id)!};
}
