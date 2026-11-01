import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {openReference} from '../src/main/database/reference_queries';
import {crestReference,referenceCatalog} from '../src/main/database/reference_details';
import {assetManifestSchema,selectedAsset} from '../src/shared/asset_catalog';
import {CrestPopupContent} from '../src/renderer/features/character_profile/crest_popup';

test('all 15 crest detail contracts preserve effects, bearer associations and local artwork gaps',()=>{
 const db=openReference(path.join(process.cwd(),'database/generated/reference.sqlite'));
 const manifest=assetManifestSchema.parse(JSON.parse(fs.readFileSync('resources/asset_manifest.json','utf8')));
 try {
  const crests=referenceCatalog(db,{kind:'crest',limit:100}).rows;assert.equal(crests.length,15);
  const missing:string[]=[];
  for(const c of crests){
   const d=crestReference(db,c.id)!;assert.equal(d.crest.id,c.id);assert.equal(d.profiles.length,1);
   assert.ok(d.associations.length>0);assert.ok(d.associations.every(a=>a.body.crest_id===c.id&&d.people.some(p=>p.id===a.body.person_id)));
   const art=selectedAsset(manifest,c.id,'icon');if(art)assert.ok(fs.existsSync(art.path!));else missing.push(c.name);
  }
  assert.deepEqual(missing.sort(),['Diadem of Entirety','Diadem of Temperance']);
  const apostle=crestReference(db,crests.find(c=>c.name==='Diadem of the Apostle')!.id)!;
  assert.equal(apostle.profiles[0].body.effect_text.value,'Grants Hit+20. Trigger % = 20.');
  assert.equal(apostle.associations.find(a=>a.body.person_id==='cai')!.body.dragon_label.value,'Ice Dragon');
  assert.ok(apostle.people.some(p=>p.name==='Yuri')); // Keep non-playable source bearers too.
  assert.equal(crestReference(db,'cai'),null);assert.equal(crestReference(db,'missing'),null);assert.throws(()=>crestReference(db,'\0'));
 } finally {db.close();}
});

test('crest popup keeps missing effects explicit and only links catalog characters',()=>{
 const db=openReference(path.join(process.cwd(),'database/generated/reference.sqlite'));
 try {
  const crests=referenceCatalog(db,{kind:'crest',limit:100}).rows;
  for(const name of ['Diadem of Temperance','Diadem of Entirety']){
   const data=crestReference(db,crests.find(c=>c.name===name)!.id)!;
   const html=renderToStaticMarkup(createElement(CrestPopupContent,{data,catalog:new Set<string>(),onCharacter:()=>{}}));
   assert.match(html,/Effect not documented\./);assert.doesNotMatch(html,/<button|Trigger: Unknown/);
  }
  const data=crestReference(db,crests.find(c=>c.name==='Diadem of the Apostle')!.id)!;
  const html=renderToStaticMarkup(createElement(CrestPopupContent,{data,catalog:new Set(['cai']),onCharacter:()=>{}}));
  assert.equal((html.match(/<button/g)??[]).length,1);assert.match(html,/Ice Dragon/);assert.match(html,/Yuri/);
 } finally {db.close();}
});
