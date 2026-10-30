import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { assetManifestSchema, assetPathSchema, selectedAsset, selectedAssetUrl, assetUrl, type AssetManifest } from '../src/shared/asset_catalog';
import { loadAssetFiles, validatedAssetFiles, resolveAssetRequest } from '../src/main/asset_files';
import { sha256, loadReferenceV3 } from '../scripts/reference_v3_sources';
import { inspectSourceImage } from '../scripts/image_metadata';
import { SKILLS } from '../src/shared/catalog';
import { referenceV3Fixture } from './reference_v3_fixture';
const root=process.cwd(),read=(p:string)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const manifest=assetManifestSchema.parse(read(`resources/asset_manifest.json`));
const core=read('data/contracts/retained_core_ids.json') as {id:string;kind:string}[];
const clone=()=>structuredClone(manifest);
const derived=['authority','gauntlets','infantry','spears'];

test('validates every bundled file hash, byte count, actual dimensions, format and attribution',()=>{
 assert.equal(manifest.schema_version,2);const files=validatedAssetFiles(path.join(root,'resources'),manifest);
 assert.equal(files.size,911);
 for(const r of Object.values(manifest.resources))if(r.file_state==='captured') {
  const bytes=fs.readFileSync(path.join(root,r.path!)),actual=inspectSourceImage(bytes);
  assert.deepEqual([actual.format,actual.width,actual.height],[r.format,r.width,r.height]);assert.equal(sha256(bytes),r.sha256);
  assert.match(r.attribution,/Nintendo/);assert.equal(r.authentic_rip_state,'unassessed');
  assert.ok(r.sources.every(s=>s.state==='historical_local'||(s.source_url?.startsWith('https://yuphastemple.com/')&&s.retrieved_at&&s.http_status===200)));
 }
 for(const entry of fs.readdirSync(path.join(root,'resources/catalog')))assert.ok(Object.values(manifest.resources).some(r=>r.path===`resources/catalog/${entry}`),'Unregistered catalog file');
});
test('covers all stable characters/classes and all affinity modes, preserving named variants and derived provenance',()=>{
 for(const e of core.filter(e=>e.kind==='character')){assert.ok(selectedAsset(manifest,e.id,'portrait'));assert.ok(selectedAsset(manifest,e.id,'thumbnail'));}
 for(const e of core.filter(e=>e.kind==='class'))assert.ok(selectedAsset(manifest,e.id,'class_icon'));
 assert.notEqual(selectedAsset(manifest,'noble','class_icon','male')!.id,selectedAsset(manifest,'noble','class_icon','female')!.id);
 for(const s of SKILLS)for(const v of ['neutral','boon','bane']){
  const r=selectedAsset(manifest,s,'skill_icon',v);assert.ok(r);
  assert.equal(r.derived_state,derived.includes(s)&&v==='bane'?'derived_composite':'not_applicable');
 }
 for(const s of derived){assert.equal(selectedAsset(manifest,s,'skill_icon','hosted_bane')!.authentic_rip_state,'unassessed');assert.equal(selectedAsset(manifest,s,'skill_icon','hosted_bane')!.derived_state,'not_applicable');}
 assert.equal(selectedAssetUrl(manifest,'unknown_character','portrait'),null);
});
test('mappings distinguish same-name action kinds, shared upgrade artwork, category art and placeholders',()=>{
 const identities=read(`data/source/identity_registry.json`).records.filter((r:any)=>r.record_kind==='entities').map((r:any)=>r.body);
 const find=(name:string,kind:string)=>identities.find((e:any)=>e.display_name===name&&e.kind===kind).id;
 const brio=find('Brio','ability'),plus=find('Brio+','ability');assert.notEqual(brio,plus);
 assert.equal(selectedAsset(manifest,brio,'icon')!.id,selectedAsset(manifest,plus,'icon')!.id);
 assert.equal(manifest.bindings.find(b=>b.subject_entity_id===plus&&b.selected&&b.role==='icon')!.kind,'shared');
 assert.notEqual(selectedAsset(manifest,find('Barrier','ability'),'icon')!.id,selectedAsset(manifest,find('Barrier','spell'),'icon')!.id);
 assert.ok(manifest.bindings.some(b=>b.selected&&b.kind==='category'&&manifest.resources[b.resource_id].sources.some(s=>s.source_url?.includes('/arts/'))));
 assert.ok(manifest.bindings.some(b=>b.kind==='placeholder'));
 const catalogOnly=manifest.bindings.filter(b=>b.catalog_key?.includes('/abilities/'));assert.equal(catalogOnly.length,421);
 assert.ok(catalogOnly.every(b=>b.subject_entity_id===null&&!b.selected));
});
test('accounts for the full captured game-image corpus, excludes website branding, and retains real source gaps',()=>{
 const staff=Object.values(manifest.resources).find(r=>r.sources.some(s=>s.source_url?.endsWith('/items/staff.png')))!;
 assert.equal(staff.file_state,'source_missing');assert.equal(staff.path,null);assert.equal(staff.sources[0].http_status,404);
 assert.ok(manifest.unresolved.some(g=>g.reason.includes('fallback')));
});
test('local artwork protocol rejects paths, unknown IDs, authorities, alternate methods and file substitutions',()=>{
 const files=validatedAssetFiles(path.join(root,'resources'),manifest),r=selectedAsset(manifest,'klapka','portrait')!;
 assert.equal(resolveAssetRequest(files,assetUrl(r.id)),files.get(r.id));
 for(const u of ['file:///etc/passwd','https://asset/'+r.id,'loom-art://other/'+r.id,'loom-art://asset/../../etc/passwd','loom-art://asset/%2e%2e%2fetc%2fpasswd','loom-art://asset/%ZZ','loom-art://user:pass@asset/'+r.id,assetUrl(r.id)+'?path=x',assetUrl(r.id)+'#x',assetUrl('unknown')])assert.equal(resolveAssetRequest(files,u),null);
 assert.equal(resolveAssetRequest(files,assetUrl(r.id),'POST'),null);
 for(const p of ['../private.png','resources/catalog/../../secret.png','/tmp/a.png','resources/catalog/a.svg'])assert.equal(assetPathSchema.safeParse(p).success,false);
 const changed=clone();changed.resources[r.id].sha256='0'.repeat(64);assert.throws(()=>validatedAssetFiles(path.join(root,'resources'),changed),/hash differs/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loom_asset_path_'));
 try {fs.mkdirSync(path.join(dir,'catalog'));fs.symlinkSync(path.join(root,r.path!),path.join(dir,'catalog','escape.webp'));const one=clone();one.resources={[r.id]:{...r,path:'resources/catalog/escape.webp'}};assert.throws(()=>validatedAssetFiles(dir,one),/escapes/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('closed contracts reject ambiguous slots, unknown keys, dangling art and incorrect formats',()=>{
 const ambiguous=clone(),binding=ambiguous.bindings.find(b=>b.selected&&b.subject_entity_id==='cai'&&b.role==='portrait')!;ambiguous.bindings.push({...binding,id:'another_binding'});assert.equal(assetManifestSchema.safeParse(ambiguous).success,false);
 const dangling=clone();dangling.bindings[0].resource_id='missing';assert.equal(assetManifestSchema.safeParse(dangling).success,false);
 const unknown=clone() as any;unknown.hidden_network_fallback=true;assert.equal(assetManifestSchema.safeParse(unknown).success,false);
 const bad=clone(),r=selectedAsset(bad,'klapka','portrait')!;r.format='png';assert.equal(assetManifestSchema.safeParse(bad).success,false);
});
test('asset validation rejects mismatched bindings and changed manifest bytes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loom_asset_validation_'));
 try {
  const fixture=referenceV3Fixture(dir),r=selectedAsset(manifest,'klapka','portrait')!,resources=path.join(dir,'resources');fs.mkdirSync(path.join(resources,'catalog'),{recursive:true});fs.copyFileSync(path.join(root,r.path!),path.join(dir,r.path!));
  fixture.add('assets','asset_resources','art:fixture',{id:r.id,sha256:r.sha256,relative_path:r.path,format:r.format,width_px:r.width,height_px:r.height,byte_count:r.bytes,file_state:r.file_state,attribution:r.attribution,authentic_rip_state:r.authentic_rip_state,derived_state:r.derived_state});
  fixture.add('assets','asset_bindings','art_binding:fixture',{resource_id:r.id,subject_entity_id:'cai',subject_record_id:null,role:'portrait',variant_json:{},binding_kind:'direct',resolution:'mapped'},'cai');fixture.write();
  const binding={id:'fixture_binding',subject_entity_id:'cai',subject_skill_id:null,subject_record_id:null,catalog_key:null,role:'portrait',variant:'',resource_id:r.id,kind:'direct',selected:true,evidence:'Synthetic binding integrity fixture.'};
  const m={...manifest,dataset_version:'test.1',resources:{[r.id]:{...r,sources:[{capture_id:null,source_url:null,retrieved_at:null,http_status:null,state:'historical_local'}]}},bindings:[binding],unresolved:[]};
  const text=JSON.stringify(m);fs.writeFileSync(path.join(resources,'candidate_manifest.json'),text);const dataset=JSON.parse(fs.readFileSync(path.join(dir,'data/dataset_manifest.json'),'utf8'));dataset.runtime_assets={path:'resources/candidate_manifest.json',sha256:sha256(text)};fs.writeFileSync(path.join(dir,'data/dataset_manifest.json'),JSON.stringify(dataset));
  loadReferenceV3(dir);
  const mismatched=JSON.stringify({...m,bindings:[{...binding,role:'class_icon'}]});fs.writeFileSync(path.join(resources,'candidate_manifest.json'),mismatched);dataset.runtime_assets.sha256=sha256(mismatched);fs.writeFileSync(path.join(dir,'data/dataset_manifest.json'),JSON.stringify(dataset));assert.throws(()=>loadReferenceV3(dir),/artwork binding mismatch/);dataset.runtime_assets.sha256=sha256(text);fs.writeFileSync(path.join(dir,'data/dataset_manifest.json'),JSON.stringify(dataset));
  fs.writeFileSync(path.join(resources,'candidate_manifest.json'),text+' ');assert.throws(()=>loadReferenceV3(dir),/Runtime asset manifest hash/);fs.writeFileSync(path.join(resources,'candidate_manifest.json'),text);
  fs.writeFileSync(path.join(resources,'asset_manifest.json'),'original runtime manifest');const original=fs.readFileSync(path.join(dir,'data/dataset_manifest.json'));
  assert.equal(fs.readFileSync(path.join(resources,'asset_manifest.json'),'utf8'),'original runtime manifest');assert.deepEqual(fs.readFileSync(path.join(dir,'data/dataset_manifest.json')),original);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
