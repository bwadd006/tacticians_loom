import type Database from 'better-sqlite3';
import { z } from 'zod';
import { fieldSchema } from '../../shared/reference_v3';
import { detailRecordSchemas,referenceIdSchema } from '../../shared/reference_details';
import type { CharacterProfile } from '../../shared/character_profile';
import {facts,entity,entities,actions,scope,profileLinks,query,slots,v3} from './reference_details';
export function characterProfile(db:Database.Database,input:unknown):CharacterProfile|null {
  v3(db);const id=referenceIdSchema.parse(input),character=entity(db,id);
  if(!character||!query(db,'SELECT id FROM characters WHERE id=?',id).length)return null;
  const identity=facts(db,'character_identity','f.character_id=?',id),statProfiles=facts(db,'stat_profiles','f.owner_id=?',id);
  const statValues=query(db,"SELECT * FROM records WHERE record_kind='stat_values' AND json_extract(body_json,'$.profile_id') IN (SELECT record_id FROM stat_profiles WHERE owner_id=?) ORDER BY id",id)
    .map(r=>detailRecordSchemas.stat_values.parse({id:r.id,record_kind:r.record_kind,entity_id:r.entity_id,context_id:r.context_id,body:JSON.parse(r.body_json)}));
  const initialSkills=facts(db,'initial_skills','f.character_id=?',id),startingStates=facts(db,'starting_states','f.character_id=?',id);
  const loadouts=facts(db,'loadout_entries',`f.starting_state_id IN (${slots(startingStates)})`,...startingStates.map(s=>s.id));
  const recruitment=facts(db,'recruitment_events','f.character_id=?',id);
  const timing=facts(db,'time_assertions',`f.owner_record_id IN (${slots(recruitment)})`,...recruitment.map(r=>r.id));
  const crests=facts(db,'crest_associations','f.person_id=?',id),crestIds=crests.map(c=>c.body.crest_id).filter((s):s is string=>s!==null);
  const crestProfiles=facts(db,'crest_profiles',`f.crest_id IN (${slots(crestIds)})`,...crestIds);
  const blaze=facts(db,'blaze_associations','f.character_id=? OR f.person_id=?',id,id);
  const blazeTypes=facts(db,'blaze_type_profiles',`f.blaze_type_id IN (${slots(blaze)})`,...blaze.map(b=>b.body.blaze_type_id));
  const actionRows=actions(db,blaze.map(b=>b.body.action_id)),links=profileLinks(db,blaze.map(b=>({id:b.id,actionId:b.body.action_id})));
  const ownedActionIds=query(db,'SELECT acquired_entity_id FROM learning_awards WHERE character_id=?',id).map(r=>r.acquired_entity_id).filter((s):s is string=>typeof s==='string');
  const relatedActionIds=[...ownedActionIds,...actionRows.map(a=>a.id)];
  const relations=facts(db,'action_relations',`f.from_id IN (${slots(relatedActionIds)}) OR f.to_id IN (${slots(relatedActionIds)})`,...relatedActionIds,...relatedActionIds);
  const records=[...identity,...statProfiles,...statValues,...initialSkills,...startingStates,...loadouts,...recruitment,...timing,...crests,...crestProfiles,...blaze,...blazeTypes,...links.profiles,...relations];
  const conditionLinks=query(db,`SELECT record_id,condition_id,role FROM record_conditions WHERE record_id IN (${slots(records)})`,...records.map(r=>r.id));
  const scoped=scope(db,[...records,...conditionLinks.map(r=>({context_id:null,body:{condition_id:r.condition_id}}))]);
  const related=entities(db,[...identity.map(i=>i.body.unique_class_id),...startingStates.map(s=>s.body.class_id),...statProfiles.flatMap(p=>[p.body.class_id,p.body.modifier_source_id]),...loadouts.map(l=>l.body.target_id),...crests.map(c=>c.body.crest_id),...blaze.map(b=>b.body.blaze_type_id),...relations.flatMap(r=>[r.body.from_id,r.body.to_id]),...scoped.conditions.flatMap(c=>[c.subject_id,c.object_id])]);
  const movement=startingStates.filter(s=>s.body.class_id!==null).map(s=>{
    const rows=query(db,'SELECT r.body_json FROM class_profiles p JOIN records r ON r.id=p.record_id WHERE p.class_id=?',s.body.class_id);
    const value=rows.length===1?JSON.parse(rows[0].body_json).movement_value:{state:'source_missing',value:null,claim_ids:[],selected_claim_id:null,reason:'Starting-class movement is not established.'};
    return {startingStateId:s.id,classId:s.body.class_id!,value:fieldSchema(z.number()).parse(value)};
  });
  return {character,identity,statProfiles,statValues,initialSkills,startingStates,loadouts,recruitment,timing,crests,crestProfiles,blaze,blazeTypes,actions:actionRows,...links,relations,related,movement,recordConditions:conditionLinks.map(r=>({recordId:r.record_id,conditionId:r.condition_id,role:r.role})),...scoped};
}
