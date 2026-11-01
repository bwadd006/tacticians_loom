import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import {openReference} from '../src/main/database/reference_queries';
import {mapOverview,mapLocationDetail,mapEntityDetail} from '../src/main/database/interactive_map';
import {defaultMapPreference,normalizeMapPreference,mapPreferenceSchema,mapPosition,mapMatches,mapSuggestions,targetEntries,zoomAt} from '../src/shared/interactive_map';
import {openUserDatabase,saveMapPreference,loadMapPreference,saveCharacterProfilePreference,loadCharacterProfilePreference,setCharacterNote,listCharacterPlanning} from '../src/main/database/user_database';

let db:Database.Database;
before(()=>{db=openReference(path.join(process.cwd(),'database/generated/reference.sqlite'));});
after(()=>db.close());
test('all five story views expose the complete marker union, categories and offline tile pyramid',()=>{
  const first=mapOverview(db,undefined);assert.equal(first.contexts.length,5);assert.equal(first.locations.length,309);assert.equal(first.categories.length,17);assert.ok(first.categories.every(c=>c.iconId));assert.equal(first.surface.tiles.length,139);
  assert.equal(first.contexts[4].part,3);assert.equal(first.contexts[4].routeId,null);assert.equal(first.contexts[4].routeScope,'unknown');
  const seen=new Set<string>();
  for(const context of first.contexts){const data=mapOverview(db,context.id);const listed=mapMatches(data,null);assert.ok(listed.length>100);for(const l of listed)seen.add(l.id);assert.ok(data.entries.every(e=>listed.some(l=>l.id===e.locationId)));assert.ok(data.entries.some(e=>e.role==='reported_chest_content'));}
  assert.equal(seen.size,309);
  assert.throws(()=>mapOverview(db,'unsupported_context'));assert.throws(()=>mapOverview(db,{sql:'SELECT'}));
  assert.equal(mapLocationDetail(db,{contextId:first.contextId,locationId:'missing'}),null);
  assert.throws(()=>mapLocationDetail(db,{contextId:first.contextId,locationId:'missing',sql:'DELETE'}));
});
test('Part III replacement shops do not union base stock or unrelated contexts',()=>{
  const initial=mapOverview(db,undefined),data=mapOverview(db,initial.contexts[4].id),kassite=data.locations.find(l=>l.name==='Kassite')!;
  const detail=mapLocationDetail(db,{contextId:data.contextId,locationId:kassite.id})!;
  const armory=detail.entries.filter(e=>e.group==='Armory');assert.deepEqual(armory.map(e=>e.name),['Short Spear+2']);assert.equal(armory[0].stock,null);assert.equal(armory[0].price,null);
  assert.ok(!detail.entries.some(e=>e.group==='Market'||e.group==='Item Shop'));
  const leda=mapOverview(db,initial.contexts[3].id);assert.ok(leda.entries.some(e=>e.locationId===kassite.id&&e.name==='Bronze Spear'));
  assert.ok(!data.entries.some(e=>e.locationId===kassite.id&&e.name==='Bronze Spear'));
  assert.deepEqual(detail.entries,data.entries.filter(e=>e.locationId===kassite.id));
});
test('reverse content search retains variants, aliases, distinct destinations and unknown rates',()=>{
  const data=mapOverview(db,mapOverview(db,undefined).contexts[2].id);
  const choices=mapSuggestions(data,'IRON SWORD');assert.ok(choices.some(c=>c.name==='Iron Sword'));assert.ok(choices.some(c=>c.name.startsWith('Iron Sword+')));
  const base=choices.find(c=>c.name==='Iron Sword')!,target={id:base.id,name:base.name,kind:'item' as const};
  const entries=targetEntries(data,target);assert.ok(entries.length);assert.ok(entries.every(e=>e.name==='Iron Sword'));
  assert.ok(entries.some(e=>e.listedPrice==='1500'));assert.ok(entries.every(e=>e.price===null));
  assert.equal(mapMatches(data,target).length,new Set(entries.map(e=>e.locationId)).size);assert.equal(base.count,new Set(entries.map(e=>e.locationId)).size);
  assert.deepEqual(mapSuggestions(data,"%' OR 1=1 --"),[]);
  assert.ok(data.entries.some(e=>e.role==='gatherable'&&e.probability===null));
  const regia=data.locations.find(l=>l.name==='Regia')!,region={id:regia.regionId!,name:regia.regionName!,kind:'region' as const};assert.ok(mapMatches(data,region).every(l=>l.regionId===regia.regionId));
});
test('nested chest contexts select the active part and route without blending reward lists',()=>{
  const initial=mapOverview(db,undefined),part1=mapOverview(db,initial.contexts[2].id),part3=mapOverview(db,initial.contexts[4].id);
  const cave=part1.locations.find(l=>l.name==="Aditi's Cave")!;
  assert.deepEqual(part1.entries.filter(e=>e.locationId===cave.id&&e.role==='reported_chest_content').map(e=>e.name),['Archive Γ','Large Bullion','Spirit Board Game']);
  assert.deepEqual(part3.entries.filter(e=>e.locationId===cave.id&&e.role==='reported_chest_content').map(e=>e.name),["Hunter's Bow+3",'Spirit Dust','Tactics Manual']);
});
test('source coordinates and pointer zoom preserve geographic anchors',()=>{
  const data=mapOverview(db,undefined),spatial=data.surface.spatial;
  assert.deepEqual(mapPosition(64,192,spatial),{x:.25,y:.25});assert.equal(mapPosition(null,100,spatial),null);
  const before={x:.5,y:.5},pointer={x:650,y:200},size={width:800,height:600};
  const next=zoomAt(before,1,2,pointer,size,600);
  assert.ok(Math.abs(before.x+(pointer.x-400)/600-(next.center.x+(pointer.x-400)/1200))<1e-10);
  assert.ok(Math.abs(before.y+(pointer.y-300)/600-(next.center.y+(pointer.y-300)/1200))<1e-10);
  assert.equal(zoomAt(before,1,50,pointer,size,600).zoom,16);
});
test('map restoration retains all-off filters and zero-result targets and repairs only stale browsing IDs',()=>{
  const data=mapOverview(db,undefined),fresh=defaultMapPreference(data);
  const saved={...fresh,categoryIds:[],zoom:4,target:{id:data.targets[0].id,name:data.targets[0].name,kind:'item' as const}};
  const restored=normalizeMapPreference(saved,data);assert.deepEqual(restored.value.categoryIds,[]);assert.equal(restored.value.zoom,4);assert.deepEqual(restored.value.target,saved.target);
  const repaired=normalizeMapPreference({...saved,contextId:'retired_context',selectedLocationId:'retired_location',categoryIds:['retired_category']},data);assert.equal(repaired.value.contextId,data.contexts[0].id);assert.equal(repaired.value.selectedLocationId,null);assert.deepEqual(repaired.value.categoryIds,[]);assert.ok(repaired.repaired);
  for(const value of [{...fresh,zoom:NaN},{...fresh,zoom:0},{...fresh,center:{x:2,y:.5}},{...fresh,categoryIds:['x','x']},{...fresh,sql:'DELETE'}])assert.equal(mapPreferenceSchema.safeParse(value).success,false);
});
test('schema-5 migration preserves existing player records and independently round-trips the map view',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'loom_map_saves_')),file=path.join(root,'player.sqlite');
  try {let player=openUserDatabase(file);setCharacterNote(player,{characterId:'unresolved_character',note:'Keep my note'},'old');saveCharacterProfilePreference(player,{characterId:'eshmel'});const notes=listCharacterPlanning(player);player.exec('DROP TABLE map_preference; PRAGMA user_version=5');player.close();
    player=openUserDatabase(file);assert.equal(player.pragma('user_version',{simple:true}),6);assert.deepEqual(listCharacterPlanning(player),notes);assert.deepEqual(loadCharacterProfilePreference(player),{characterId:'eshmel'});assert.equal(loadMapPreference(player),null);
    const value={...defaultMapPreference(mapOverview(db,undefined)),zoom:5,categoryIds:[],selectedLocationId:'unresolved_saved_location'};saveMapPreference(player,value);player.close();player=openUserDatabase(file);assert.deepEqual(loadMapPreference(player),value);assert.deepEqual(listCharacterPlanning(player),notes);
    const raw=JSON.stringify({version:99});player.prepare('UPDATE map_preference SET preference_json=?').run(raw);assert.throws(()=>loadMapPreference(player));assert.equal(player.prepare('SELECT preference_json FROM map_preference').pluck().get(),raw);player.close();
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('every mapped mount and battalion opens its typed reference without exposing raw records',()=>{
  const data=mapOverview(db,undefined);
  for(const t of data.targets.filter(t=>['mount_variant','mount','battalion'].includes(t.kind))){const result=mapEntityDetail(db,{id:t.id,kind:t.kind==='battalion'?'battalion':'mount'});if(!result){assert.equal(db.prepare(`SELECT count(*) FROM ${t.kind==='battalion'?'battalions':'mounts'} WHERE id=?`).pluck().get(t.id),0);continue;}assert.equal(result.entity.id,t.id);assert.ok(result.facts.length);assert.ok(!('body_json'in result));}
  assert.equal(mapEntityDetail(db,{id:'cai',kind:'mount'}),null);assert.throws(()=>mapEntityDetail(db,{id:'cai',kind:'character'}));
});
