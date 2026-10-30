import type Database from 'better-sqlite3';
import { z } from 'zod';
import { fieldSchema } from '../../shared/reference_v3';
import { detailRecordSchemas, referenceIdSchema, catalogRequestSchema, locationRequestSchema, markerRequestSchema, markerListRequestSchema, evidenceRequestSchema, contextSchema, conditionSchema, actionKindSchema,
 type DetailKind,type DetailRecord,type EntitySummary,type ActionSummary,type ReferenceScope,type ReferencePage,type CharacterLearning,type ClassRewards,type ActionReference,type CharacterSocial,type ItemReference,type LocationReference,type MapSurfaceReference,type MarkerReference,type MarkerSummary,type ClaimEvidence,type ProfileLink } from '../../shared/reference_details';

type SqlValue=string|number|null;
type Row=Record<string,any>; // SQL rows are parsed into closed shared read contracts below.
const query=(db:Database.Database,sql:string,...args:SqlValue[])=>db.prepare(sql).all(...args) as Row[];
const one=(db:Database.Database,sql:string,...args:SqlValue[])=>query(db,sql,...args)[0];
const unique=(ids:(string|null|undefined)[])=>[...new Set(ids.filter((s):s is string=>typeof s==='string'))];
const slots=(ids:readonly unknown[])=>ids.length?ids.map(()=>'?').join(','):'NULL';
function v3(db:Database.Database){if(db.pragma('user_version',{simple:true})!==3)throw new Error('Expanded reference operations require reference schema 3.');}
function facts<K extends DetailKind>(db:Database.Database,kind:K,where='1',...args:SqlValue[]):DetailRecord<K>[] {
 const schema=detailRecordSchemas[kind];
 return query(db,`SELECT r.* FROM "${kind}" f JOIN records r ON r.id=f.record_id WHERE ${where} ORDER BY r.id`,...args).map(r=>schema.parse({id:r.id,record_kind:r.record_kind,entity_id:r.entity_id,context_id:r.context_id,body:JSON.parse(r.body_json)})) as DetailRecord<K>[];
}
function byRecordIds<K extends DetailKind>(db:Database.Database,kind:K,ids:string[]){return facts(db,kind,`f.record_id IN (${slots(ids)})`,...ids);}
function entity(db:Database.Database,id:string):EntitySummary|null {const e=one(db,'SELECT * FROM entities WHERE id=?',id);return e?{id:e.id,kind:e.kind,name:e.display_name,identityState:e.identity_state,retired:e.retired===1}:null;}
function entities(db:Database.Database,ids:(string|null|undefined)[]):EntitySummary[]{const all=unique(ids);return query(db,`SELECT * FROM entities WHERE id IN (${slots(all)}) ORDER BY display_name COLLATE NOCASE,id`,...all).map(e=>({id:e.id,kind:e.kind,name:e.display_name,identityState:e.identity_state,retired:e.retired===1}));}
function action(db:Database.Database,id:string):ActionSummary|null {const a=one(db,'SELECT * FROM actions WHERE id=?',id),e=entity(db,id);return a&&e?{...e,actionKind:actionKindSchema.parse(a.action_kind),skillId:a.skill_id,profileRecordId:a.profile_record_id}:null;}
function actions(db:Database.Database,ids:(string|null|undefined)[]){return unique(ids).map(id=>action(db,id)).filter((a):a is ActionSummary=>a!==null);}
type Scoped={context_id:string|null;body:Record<string,unknown>};
function scope(db:Database.Database,records:Scoped[],extraContexts:string[]=[]):ReferenceScope {
 const contextIds=unique([...records.map(r=>r.context_id),...extraContexts]);
 const contexts=contextIds.map(id=>one(db,'SELECT * FROM contexts WHERE id=?',id)).filter(Boolean).map(c=>contextSchema.parse({...c,route_ids:query(db,'SELECT route_id FROM context_routes WHERE context_id=? ORDER BY route_id',c.id).map(r=>r.route_id)}));
 const roots=unique([...contexts.map(c=>c.condition_root_id),...records.flatMap(r=>Object.entries(r.body).filter(([k,v])=>['condition_id','condition_root_id','grade_root_id'].includes(k)&&typeof v==='string').map(([,v])=>v as string))]);
 const collected=new Map<string,z.infer<typeof conditionSchema>>(),pending=[...roots];
 while(pending.length){const id=pending.pop()!;if(collected.has(id))continue;const c=one(db,'SELECT * FROM conditions WHERE id=?',id);if(!c)throw new Error('Missing reference condition');const children=query(db,'SELECT child_id AS id,display_order AS "order" FROM condition_children WHERE parent_id=? ORDER BY display_order',id);
  const value=conditionSchema.parse({id:c.id,node_kind:c.node_kind,predicate:c.predicate,subject_id:c.subject_id,object_id:c.object_id,value:JSON.parse(c.value_json),claim_id:c.claim_id,children});collected.set(id,value);pending.push(...value.children.map(c=>c.id));
 }
 return {contexts:contexts.sort((a,b)=>a.id.localeCompare(b.id)),conditions:[...collected.values()].sort((a,b)=>a.id.localeCompare(b.id))};
}
function profileLinks(db:Database.Database,owners:{id:string;actionId:string|null}[]):{profileLinks:ProfileLink[];profiles:DetailRecord<'action_profiles'>[]} {
 const links:ProfileLink[]=[];
 for(const owner of owners){if(!owner.actionId)continue;const source=query(db,"SELECT context_json FROM source_mentions WHERE record_id=? AND field_path='/effect_profile'",owner.id);
  const ids=unique(source.map(r=>JSON.parse(r.context_json).profile_record_id));if(ids.length>1)throw new Error('Ambiguous owner action profile');
  const id=ids[0]??one(db,'SELECT profile_record_id FROM actions WHERE id=?',owner.actionId)?.profile_record_id;
  if(id)links.push({ownerRecordId:owner.id,profileRecordId:id});
 }
 return {profileLinks:links,profiles:byRecordIds(db,'action_profiles',unique(links.map(l=>l.profileRecordId)))};
}
export function referenceCatalog(db:Database.Database,input:unknown):ReferencePage<EntitySummary> {
 v3(db);const r=catalogRequestSchema.parse(input);
 const tables={character:'characters',class:'classes',action:'actions',item:'items',mount:'mounts',battalion:'battalions',crest:'crests',blaze_type:'blaze_types',location:'locations',region:'regions',map_surface:'map_surfaces'} as const;
 const where=`e.retired=0 AND instr(lower(e.display_name),lower(?))>0${r.actionKind?' AND f.action_kind=?':''}`,args:SqlValue[]=[r.search,...(r.actionKind?[r.actionKind]:[])];
 const total=Number(one(db,`SELECT count(*) n FROM "${tables[r.kind]}" f JOIN entities e ON e.id=f.id WHERE ${where}`,...args)!.n);
 const rows=query(db,`SELECT e.* FROM "${tables[r.kind]}" f JOIN entities e ON e.id=f.id WHERE ${where} ORDER BY e.display_name COLLATE NOCASE,e.id LIMIT ? OFFSET ?`,...args,r.limit,r.offset).map(e=>({id:e.id,kind:e.kind,name:e.display_name,identityState:e.identity_state,retired:e.retired===1}));
 return {rows,total,limit:r.limit,offset:r.offset,nextOffset:r.offset+rows.length<total?r.offset+rows.length:null};
}
export function characterLearning(db:Database.Database,input:unknown):CharacterLearning|null {
 v3(db);const id=referenceIdSchema.parse(input),character=entity(db,id);if(!character||!one(db,'SELECT id FROM characters WHERE id=?',id))return null;
 const awards=facts(db,'learning_awards',`f.character_id=? OR (f.character_id IS NULL AND f.applicability='source_roster_scoped' AND EXISTS (
 SELECT 1 FROM learning_rules lr JOIN source_documents sd ON sd.capture_id=lr.source_roster_capture_id JOIN source_bindings sb ON sb.document_id=sd.id
 WHERE lr.record_id=f.rule_id AND lr.scope='captured_source_roster_shared' AND sb.entity_id=? AND sb.pointer LIKE '/DATA/characters/%/name'))`,id,id);
 const ruleIds=unique(awards.map(a=>a.body.rule_id)),rules=byRecordIds(db,'learning_rules',ruleIds),actionRows=actions(db,awards.map(a=>a.body.acquired_entity_id));
 const profiles=profileLinks(db,awards.map(a=>({id:a.id,actionId:a.body.acquired_entity_id})));
 return {character,awards,rules,actions:actionRows,...profiles,...scope(db,[...awards,...rules,...profiles.profiles])};
}
export function classRewards(db:Database.Database,input:unknown):ClassRewards|null {
 v3(db);const id=referenceIdSchema.parse(input),characterClass=entity(db,id);if(!characterClass||!one(db,'SELECT id FROM classes WHERE id=?',id))return null;
 const rewards=facts(db,'class_rewards','f.class_id=?',id),a=actions(db,rewards.map(r=>r.body.action_id)),profiles=profileLinks(db,rewards.map(r=>({id:r.id,actionId:r.body.action_id})));
 return {characterClass,rewards,actions:a,...profiles,...scope(db,[...rewards,...profiles.profiles])};
}
export function actionReference(db:Database.Database,input:unknown):ActionReference|null {
 v3(db);const id=referenceIdSchema.parse(input),a=action(db,id);if(!a)return null;
 const profiles=facts(db,'action_profiles','f.action_id=?',id),parameters=facts(db,'action_parameters','f.action_id=?',id),itemLinks=facts(db,'item_action_links','f.action_id=?',id);
 return {action:a,profiles,parameters,itemLinks,items:entities(db,itemLinks.map(i=>i.body.item_id)),...scope(db,[...profiles,...parameters,...itemLinks])};
}
export function characterSocial(db:Database.Database,input:unknown):CharacterSocial|null {
 v3(db);const id=referenceIdSchema.parse(input),character=entity(db,id);if(!character||!one(db,'SELECT id FROM characters WHERE id=?',id))return null;
 const prompts=facts(db,'bird_prompts','f.character_id=?',id).sort((a,b)=>(a.body.source_order??0)-(b.body.source_order??0)||a.id.localeCompare(b.id));
 const birdTime=prompts.map(prompt=>({prompt,answers:query(db,`SELECT a.record_id,b.id,r.body_json FROM bird_answers a JOIN bird_responses b ON b.id=a.response_id JOIN records r ON r.entity_id=b.id AND r.record_kind='bird_responses' WHERE a.prompt_id=? ORDER BY a.record_id`,prompt.id).map(a=>({id:a.record_id,responseId:a.id,text:fieldSchema(z.string()).parse(JSON.parse(a.body_json).response_text)}))}));
 const preferences=facts(db,'preferences','f.character_id=?',id);
 const supports=query(db,'SELECT * FROM support_pairs WHERE person_low_id=? OR person_high_id=? ORDER BY id',id,id).map(p=>({id:String(p.id),people:[p.person_low_id,p.person_high_id] as [string,string],variants:facts(db,'support_variants','f.pair_id=?',p.id),directionalClaims:facts(db,'support_directional_claims','f.pair_id=?',p.id)}));
 const ids=unique(preferences.map(p=>p.body.subject_id));
 const coverage=query(db,"SELECT c.* FROM coverage c JOIN records r ON r.id=c.record_id WHERE r.entity_id=? AND c.field_path IN ('/bird_time','/preferences','/supports') ORDER BY c.field_path",id).map(c=>({field:c.field_path,captureState:c.capture_state,semanticState:c.semantic_state,canonicalState:c.canonical_state,importState:c.import_state,reason:c.reason}));
 return {character,coverage,birdTime,preferences,subjects:entities(db,ids),itemIds:query(db,`SELECT id FROM items WHERE id IN (${slots(ids)}) ORDER BY id`,...ids).map(r=>r.id),supports,...scope(db,[...prompts,...preferences,...supports.flatMap(s=>[...s.variants,...s.directionalClaims])])};
}
export function itemReference(db:Database.Database,input:unknown):ItemReference|null {
 v3(db);const id=referenceIdSchema.parse(input),item=entity(db,id);if(!item||!one(db,'SELECT id FROM items WHERE id=?',id))return null;
 const profiles=facts(db,'item_profiles','f.item_id=?',id),requirements=facts(db,'item_requirements','f.item_id=?',id),actionLinks=facts(db,'item_action_links','f.item_id=?',id),variants=facts(db,'item_variants','f.item_id=? OR f.base_item_id=?',id,id);
 const recipes=facts(db,'recipes','f.output_id=?',id),recipeIds=recipes.map(r=>r.id),recipeInputs=facts(db,'recipe_inputs',`f.recipe_id IN (${slots(recipeIds)})`,...recipeIds);
 const acquisition=facts(db,'acquisition_sources','f.target_id=?',id),containerContents=facts(db,'container_contents','f.target_id=? OR f.container_id=?',id,id),locationContents=facts(db,'location_contents','f.target_id=?',id),shopOffers=facts(db,'shop_offers','f.target_id=?',id);
 const shopLocationIds=query(db,'SELECT DISTINCT s.location_id FROM shop_offers o JOIN inventory_layers l ON l.record_id=o.layer_id JOIN shops s ON s.id=l.shop_id WHERE o.target_id=?',id).map(r=>r.location_id);
 return {item,profiles,requirements,actionLinks,variants,recipes,recipeInputs,acquisition,containerContents,locationContents,shopOffers,locations:entities(db,[...acquisition.map(a=>a.body.location_id),...locationContents.map(c=>c.body.location_id),...shopLocationIds]),...scope(db,[...profiles,...requirements,...variants,...recipes,...recipeInputs,...acquisition,...containerContents,...locationContents,...shopOffers])};
}
export function locationReference(db:Database.Database,input:unknown):LocationReference|null {
 v3(db);const request=locationRequestSchema.parse(input),id=request.locationId,location=entity(db,id),row=one(db,'SELECT * FROM locations WHERE id=?',id);if(!location||!row)return null;
 const args:SqlValue[]=[id,...(request.contextId?[request.contextId]:[])];
 const locationContexts=facts(db,'location_contexts',`f.location_id=?${request.contextId?' AND r.context_id=?':''}`,...args);if(request.contextId&&!locationContexts.length)return null;
 const contextRows=locationContexts.map(c=>c.id),contents=facts(db,'location_contents',request.contextId?`f.location_id=? AND f.location_context_id IN (${slots(contextRows)})`:'f.location_id=?',id,...(request.contextId?contextRows:[]));
 const shops=query(db,'SELECT id FROM shops WHERE location_id=? ORDER BY id',id).map(s=>{
  // A context-specific replacement never unions its offers with base stock.
  // Keep only layers explicitly recorded for the selected context; absence is unknown.
  const layers=facts(db,'inventory_layers',`f.shop_id=?${request.contextId?' AND r.context_id=?':''}`,s.id,...(request.contextId?[request.contextId]:[])),ids=layers.map(l=>l.id);
  return {entity:entity(db,s.id)!,layers,offers:facts(db,'shop_offers',`f.layer_id IN (${slots(ids)})`,...ids)};
 });
 const profiles=facts(db,'location_profiles','f.location_id=?',id),markers=facts(db,'map_markers',`f.location_id=?${request.contextId?' AND EXISTS (SELECT 1 FROM marker_contexts mc WHERE mc.marker_id=f.record_id AND mc.context_id=?)':''}`,...args);
 return {location,region:row.region_id?entity(db,row.region_id):null,profiles,locationContexts,contents,shops,targets:entities(db,[...contents.map(c=>c.body.target_id),...shops.flatMap(s=>s.offers.map(o=>o.body.target_id))]),markers,...scope(db,[...profiles,...locationContexts,...contents,...shops.flatMap(s=>[...s.layers,...s.offers])],request.contextId?[request.contextId]:[])};
}
export function mapSurfaceReference(db:Database.Database,input:unknown):MapSurfaceReference|null {
 v3(db);const id=referenceIdSchema.parse(input),surface=entity(db,id),s=one(db,'SELECT * FROM map_surfaces WHERE id=?',id);if(!surface||!s)return null;
 const p=one(db,'SELECT * FROM spatial_references WHERE id=?',s.spatial_reference_id)!;
 return {surface,spatial:{id:p.id,coordinateKind:p.coordinate_kind,axisOrder:p.axis_order,unitsX:p.units_x,unitsY:p.units_y,flipY:p.flip_y===null?null:p.flip_y===1,width:p.width_px,height:p.height_px},backgroundAssetId:s.background_asset_id,tileSize:s.tile_size,tileVersion:s.tile_version,tiles:facts(db,'map_tiles','f.surface_id=?',id),geometries:facts(db,'map_geometries','f.surface_id=?',id),categories:query(db,'SELECT * FROM map_categories ORDER BY group_order,category_order,id').map(c=>({id:c.id,label:c.category_label,group:c.group_label,order:c.category_order,groupOrder:c.group_order}))};
}
export function mapMarkers(db:Database.Database,input:unknown):ReferencePage<MarkerSummary> {
 v3(db);const r=markerListRequestSchema.parse(input),where=`f.surface_id=?${r.contextId?' AND EXISTS(SELECT 1 FROM marker_contexts c WHERE c.marker_id=f.record_id AND c.context_id=?)':''}`,args:SqlValue[]=[r.surfaceId,...(r.contextId?[r.contextId]:[])];
 const total=Number(one(db,`SELECT count(*) n FROM map_markers f WHERE ${where}`,...args)!.n);
 const ids=query(db,`SELECT f.record_id FROM map_markers f WHERE ${where} ORDER BY f.record_id LIMIT ? OFFSET ?`,...args,r.limit,r.offset).map(r=>r.record_id);
 const rows=byRecordIds(db,'map_markers',ids).map(marker=>({marker,contextIds:query(db,'SELECT context_id FROM marker_contexts WHERE marker_id=? ORDER BY context_id',marker.id).map(c=>c.context_id)}));
 return {rows,total,limit:r.limit,offset:r.offset,nextOffset:r.offset+rows.length<total?r.offset+rows.length:null};
}
export function mapMarkerReference(db:Database.Database,input:unknown):MarkerReference|null {
 v3(db);const r=markerRequestSchema.parse(input),marker=byRecordIds(db,'map_markers',[r.markerId])[0];if(!marker||!one(db,'SELECT 1 FROM marker_contexts WHERE marker_id=? AND context_id=?',r.markerId,r.contextId))return null;
 return {marker,categoryIds:query(db,'SELECT category_id FROM marker_categories WHERE marker_id=? AND context_id=? ORDER BY source_order,category_id',r.markerId,r.contextId).map(r=>r.category_id),location:marker.body.location_id?locationReference(db,{locationId:marker.body.location_id,contextId:r.contextId}):null,...scope(db,[marker],[r.contextId])};
}
export function referenceEvidence(db:Database.Database,input:unknown):ClaimEvidence[] {
 v3(db);const ids=unique(evidenceRequestSchema.parse(input));
 return query(db,`SELECT c.*,d.source_url,d.sha256,d.capture_id,p.captured_at,p.source_role FROM source_claims c JOIN source_documents d ON d.id=c.document_id JOIN captures p ON p.id=d.capture_id WHERE c.id IN (${slots(ids)}) ORDER BY c.id`,...ids).map(c=>({id:c.id,recordId:c.record_id,fieldPath:c.field_path,origin:c.origin,evidenceState:c.evidence_state,valueState:c.value_state,value:z.json().parse(JSON.parse(c.value_json)),semanticRole:c.semantic_role,contextId:c.context_id,source:{url:c.source_url,pointer:c.source_pointer,sha256:c.sha256,captureId:c.capture_id,capturedAt:c.captured_at,role:c.source_role}}));
}
