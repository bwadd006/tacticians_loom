import assert from 'node:assert/strict';
import { test,before,after } from 'node:test';
import type Database from 'better-sqlite3';
import { openReference } from '../src/main/database/reference_queries';
import * as q from '../src/main/database/reference_details';
import { type CatalogRequest, detailRecordSchemas } from '../src/shared/reference_details';
import { validateSavedDataCompatibility } from '../scripts/release/save_checks';
import path from 'node:path';

let db:Database.Database;
before(()=>{db=openReference(path.join(process.cwd(),'database/generated/reference.sqlite'));});after(()=>db?.close());
const named=(kind:CatalogRequest['kind'],name:string)=>q.referenceCatalog(db,{kind,search:name,limit:100}).rows.find(r=>r.name===name)!;
test('catalog pages are bounded, deterministic, literal-search safe, and cover the full source roster',()=>{
 const first=q.referenceCatalog(db,{kind:'character',limit:7}),second=q.referenceCatalog(db,{kind:'character',limit:7,offset:first.nextOffset});assert.equal(first.total,63);assert.equal(first.rows.length,7);assert.equal(first.nextOffset,7);assert.ok(second.rows.every(c=>!first.rows.some(a=>a.id===c.id)));
 assert.deepEqual(q.referenceCatalog(db,{kind:'character',limit:7}),first);assert.equal(q.referenceCatalog(db,{kind:'class'}).total,60);assert.equal(q.referenceCatalog(db,{kind:'action',actionKind:'spell'}).total,48);
 assert.equal(q.referenceCatalog(db,{kind:'action',search:"%' OR 1=1 --"}).total,0);
 for(const bad of [{kind:'source_documents'},{kind:'action',limit:101},{kind:'item',limit:0},{kind:'item',offset:-1},{kind:'item',search:'a'.repeat(201)},{kind:'item',sql:'SELECT *'},{kind:'class',actionKind:'ability'}])assert.throws(()=>q.referenceCatalog(db,bad));
});
test('character learnsets join exact spell identities to physical acquisition items without changing shared scope',()=>{
 const learn=q.characterLearning(db,'fabio')!;assert.equal(learn.awards.filter(a=>a.body.acquisition_kind==='shared_skill_rank').length,57);assert.ok(learn.rules.some(r=>r.body.scope==='captured_source_roster_shared'));
 const spell=learn.actions.find(a=>a.actionKind==='spell'&&a.name==='Dark Spikes T')!,detail=q.actionReference(db,spell.id)!;assert.ok(spell);
 const archive=detail.items.find(i=>i.name==='Archive T')!,item=q.itemReference(db,archive.id)!;assert.equal(item.acquisition.length,5);assert.ok(item.acquisition.some(a=>a.body.location_id));assert.ok(item.contexts.length>0);
 assert.equal(learn.awards.find(a=>a.body.acquired_entity_id===spell.id&&a.body.acquisition_kind==='skill_rank')!.body.grade_id,'S');
 assert.equal(q.characterLearning(db,'unlisted_person'),null);assert.equal(q.characterLearning(db,'commoner'),null);
 assert.ok(learn.awards.filter(a=>a.body.character_id===null).every(a=>a.body.applicability==='source_roster_scoped'));
});
test('class rewards preserve owner effect profiles and distinguish mastery abilities from same-name spells',()=>{
 const rewards=q.classRewards(db,'bishop')!,mastery=rewards.rewards.find(r=>r.body.reward_kind==='mastery')!;
 const a=rewards.actions.find(a=>a.id===mastery.body.action_id)!;assert.equal(a.name,'Barrier');assert.equal(a.actionKind,'ability');
 const link=rewards.profileLinks.find(l=>l.ownerRecordId===mastery.id)!,profile=rewards.profiles.find(p=>p.id===link.profileRecordId)!;assert.equal(profile.body.effect_text.value,'Grants Res+3 to adjacent allies.');
 const spell=q.referenceCatalog(db,{kind:'action',actionKind:'spell',search:'Barrier'}).rows.find(a=>a.name==='Barrier')!;assert.notEqual(spell.id,mastery.body.action_id);
 assert.ok(mastery.body.exp_required.state!=='value'||mastery.body.exp_required.value!==null);
 assert.equal(q.classRewards(db,'cai'),null);
});
test('social joins retain whole Bird Time answers, separate meal subjects from items, and expose missing-source coverage',()=>{
 const s=q.characterSocial(db,'cai')!;assert.ok(s.birdTime.length>0);assert.ok(s.birdTime.every(p=>p.prompt.body.prompt_text.value&&p.answers.length&&p.answers.every(a=>a.text.value)));
 const gift=s.preferences.find(p=>p.body.subject_label==='Sharp Fishhook')!;assert.ok(s.itemIds.includes(gift.body.subject_id!));assert.equal(q.itemReference(db,gift.body.subject_id)!.item.name,'Sharp Fishhook');
 const meal=s.preferences.find(p=>p.body.subject_label==='Mazadins')!;assert.ok(!s.itemIds.includes(meal.body.subject_id!));assert.ok(s.subjects.some(e=>e.id===meal.body.subject_id));
 const missing=q.characterSocial(db,'klapka')!;assert.deepEqual(missing.birdTime,[]);assert.ok(missing.coverage.some(c=>c.field==='/bird_time'&&c.semanticState==='unknown'));assert.ok(missing.coverage.some(c=>c.field==='/preferences'&&c.importState==='represented_unknown'));
});
test('support graph preserves both source directions, later-part context and unknown numeric requirements',()=>{
 const s=q.characterSocial(db,'cai')!;const later=s.supports.flatMap(p=>p.variants).find(v=>s.contexts.some(c=>c.id===v.context_id&&c.part===3))!;assert.ok(later);assert.equal(s.contexts.find(c=>c.id===later.context_id)!.route_scope,'unknown');assert.ok(later.body.condition_id&&s.conditions.some(c=>c.id===later.body.condition_id));
 for(const pair of s.supports){assert.ok(pair.people.includes('cai'));assert.ok(pair.directionalClaims.every(d=>[d.body.from_person_id,d.body.to_person_id].sort().join('|')===[...pair.people].sort().join('|')));for(const v of pair.variants)if(!/Support level \d+/u.test(v.body.condition_text.value??''))assert.equal(v.body.numeric_support_threshold.value,null);}
 const p=s.supports[0],other=p.people.find(id=>id!=='cai')!,otherSide=q.characterSocial(db,other)!.supports.find(x=>x.id===p.id)!;assert.deepEqual(otherSide.directionalClaims,p.directionalClaims);
});
test('item details preserve exact refinement identities, source-null quantities and unknown drop probabilities',()=>{
 const sword=named('item','Wooden Sword'),detail=q.itemReference(db,sword.id)!;assert.ok(detail.variants.length);for(const v of detail.variants)if(v.body.refinement_level===0)assert.equal(v.body.item_id,v.body.base_item_id);
 assert.ok(detail.recipes.length);assert.ok(detail.recipeInputs.every(i=>detail.recipes.some(r=>r.id===i.body.recipe_id)));
 for(const p of detail.containerContents)assert.equal(p.body.probability_value.value,null);
 for(const profile of detail.profiles)assert.ok(detailRecordSchemas.item_profiles.safeParse(profile).success);
 assert.equal(q.itemReference(db,'bishop'),null);
});
test('map-marker joins return only the selected source context and respect replacement inventories',()=>{
 const kassite=named('location','Kassite'),all=q.locationReference(db,{locationId:kassite.id})!,part3=all.contexts.find(c=>c.part===3&&all.locationContexts.some(l=>l.context_id===c.id))!;
 assert.equal(part3.route_scope,'unknown');const selected=q.locationReference(db,{locationId:kassite.id,contextId:part3.id})!,armory=selected.shops.find(s=>s.entity.name==='Kassite / Armory')!;
 assert.deepEqual(armory.offers.map(o=>o.body.label),['Short Spear+2']);assert.equal(armory.offers[0].body.stock_json.state,'source_null');assert.equal(armory.offers[0].body.stock_json.qualifier,'unknown');assert.ok(armory.layers.every(l=>l.context_id===part3.id));
 const marker=q.mapMarkerReference(db,{markerId:selected.markers[0].id,contextId:part3.id})!;assert.equal(marker.location!.location.id,kassite.id);assert.deepEqual(marker.location!.contents,selected.contents);assert.ok(marker.categoryIds.length>0);assert.ok(marker.location!.locationContexts.every(c=>c.context_id===part3.id));
 assert.equal(q.mapMarkerReference(db,{markerId:selected.markers[0].id,contextId:'unlisted_context'}),null);assert.equal(q.locationReference(db,{locationId:kassite.id,contextId:'unlisted_context'}),null);
});
test('map metadata preserves raw coordinates, complete tiles and explicit unknown geometry without new route identities',()=>{
 const id=q.referenceCatalog(db,{kind:'map_surface'}).rows[0].id,s=q.mapSurfaceReference(db,id)!;assert.equal(s.tiles.length,139);assert.equal(s.spatial.axisOrder,'yx');assert.equal(s.spatial.flipY,true);assert.equal(s.spatial.unitsX,256);assert.equal(s.spatial.width,4948);assert.equal(s.geometries.length,17);assert.ok(s.geometries.every(g=>g.body.geometry_state==='not_supplied'&&g.body.geometry_json.coordinates===null));
 const first=q.mapMarkers(db,{surfaceId:id,limit:100});assert.equal(first.total,309);assert.equal(first.rows.length,100);assert.ok(first.rows.every(r=>r.contextIds.length>0));assert.ok(first.rows.every(r=>(r.marker.body.source_x??-1)>=0&&(r.marker.body.source_y??-1)<=256));
 const ctx=first.rows[0].contextIds[0],scoped=q.mapMarkers(db,{surfaceId:id,contextId:ctx,limit:100});assert.ok(scoped.rows.every(m=>m.contextIds.includes(ctx)));assert.throws(()=>q.mapMarkers(db,{surfaceId:id,limit:1000}));assert.equal(q.mapSurfaceReference(db,'unknown_surface'),null);
});
test('evidence retrieval retains preferred and legacy values with exact pointers and no raw document/file access',()=>{
 const rows=db.prepare("SELECT id FROM source_claims WHERE field_path='/chapter_value' AND record_id IN (SELECT e.record_id FROM recruitment_events e JOIN records r ON r.id=e.record_id JOIN context_routes cr ON cr.context_id=r.context_id WHERE e.character_id='nuzzuo' AND cr.route_id='cai')").all() as {id:string}[];
 const evidence=q.referenceEvidence(db,rows.map(r=>r.id));assert.ok(evidence.some(c=>c.origin==='preferred_source'&&c.value==='Chapter 6'));assert.ok(evidence.some(c=>c.origin==='legacy'&&c.value===7));assert.ok(evidence.every(c=>c.source.pointer&&c.source.sha256.length===64));assert.ok(evidence.every(c=>!('body'in c.source)&&!('relative_path'in c.source)));
 assert.throws(()=>q.referenceEvidence(db,Array(101).fill('x')));assert.throws(()=>q.referenceEvidence(db,[]));assert.throws(()=>q.actionReference(db,'a'.repeat(201)));assert.throws(()=>q.itemReference(db,'\0'));
 assert.deepEqual(q.referenceEvidence(db,['missing_claim']),[]);assert.throws(()=>db.prepare("UPDATE entities SET display_name='changed'").run(),/readonly|read.only/i);
});
test('schema-1 through schema-4 player fixtures retain notes, rules, timestamps and unresolved IDs',()=>{
 const result=validateSavedDataCompatibility(db);assert.equal(result.versions.length,4);assert.equal(result.retainedCharacterIds,63);assert.equal(result.realUserDataOpened,false);
});
