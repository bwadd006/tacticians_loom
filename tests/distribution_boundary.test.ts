import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateDistributionBoundary} from '../scripts/distribution_boundary';
function fixture(run:(root:string)=>void){const root=fs.mkdtempSync(path.join(os.tmpdir(),'loom_boundary_'));try{
 fs.mkdirSync(path.join(root,'data/source'),{recursive:true});fs.writeFileSync(path.join(root,'data/dataset_manifest.json'),JSON.stringify({documents:[{path:'data/source/evidence.json'}]}));fs.writeFileSync(path.join(root,'data/source/evidence.json'),JSON.stringify({records:[{record_kind:'source_documents',body:{body:null,relative_path:null}}]}));run(root);
}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('source boundary accepts maintained citations and rejects private files across directories',()=>fixture(root=>{
 assert.equal(validateDistributionBoundary(root).status,'passed');
 for(const name of ['data/imports/raw.json','src/raw/content.json','tests/i4_snapshot.json','scripts/capture_yuphas_source.ts']){
  const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'private');assert.throws(()=>validateDistributionBoundary(root),/Private acquisition/);fs.rmSync(file);const directory=path.dirname(file);if(directory!==path.join(root,'data/source'))fs.rmdirSync(directory);
 }
}));
test('source boundary rejects embedded original documents and private citation paths',()=>fixture(root=>{
 const file=path.join(root,'data/source/evidence.json');
 for(const body of [{body:'website source',relative_path:null},{body:null,relative_path:'raw/data.json'}]){fs.writeFileSync(file,JSON.stringify({records:[{record_kind:'source_documents',body}]}));assert.throws(()=>validateDistributionBoundary(root),/cannot be distributed/);}
}));
