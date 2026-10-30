import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadReferenceV3,sha256 } from './reference_v3_sources';
import { validateReferenceV3,recordDigest } from './reference_v3_builder';
import { openReference,metadata } from '../src/main/database/reference_queries';
import { validateAssets } from './validate_assets';
import { validateReferenceRelationships } from './release/relationship_checks';
import { validateSavedDataCompatibility } from './release/save_checks';
export function validateReferenceRelease(appRoot:string,options:{resources?:string;exhaustive?:boolean}={}) {
 const input=loadReferenceV3(appRoot),schema=fs.readFileSync(path.join(appRoot,'database/reference_schema_v3.sql'),'utf8');
 const fingerprint=sha256(JSON.stringify({hashes:input.hashes,schema:sha256(schema)}));
 const active=path.join(appRoot,'database/generated/reference.sqlite'),resources=options.resources??path.join(appRoot,'resources');
 const file=options.resources?path.join(resources,'reference.sqlite'):active;
 const db=openReference(file);try {
  assert.equal(metadata(db,'input_fingerprint'),fingerprint,'Rebuild reference data after changing maintained inputs');
  assert.equal(metadata(db,'record_content_sha256'),recordDigest(input.records),'Database facts differ from maintained data');
  const validation=validateReferenceV3(db),assets=validateAssets(resources);
  if(options.resources){assert.equal(sha256(fs.readFileSync(file)),sha256(fs.readFileSync(active)),'Packaged reference differs');assert.equal(sha256(fs.readFileSync(path.join(resources,'asset_manifest.json'))),input.manifest.runtime_assets!.sha256);}
  return {status:'passed',dataset_version:input.manifest.dataset_version,validation,assets,
   relationships:options.exhaustive===false?{status:'same_validated_reference_bytes'}:validateReferenceRelationships(db),saves:validateSavedDataCompatibility(db)};
 }finally{db.close();}
}
if(require.main===module){
 const args=process.argv.slice(2);let resources:string|undefined,output:string|undefined;
 for(let i=0;i<args.length;i+=2){if(!args[i+1])throw new Error('Options require a value');if(args[i]==='--resources')resources=path.resolve(args[i+1]);else if(args[i]==='--output')output=path.resolve(args[i+1]);else throw new Error('Unknown release validation option');}
 const report=validateReferenceRelease(process.cwd(),{resources,exhaustive:!resources});if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
