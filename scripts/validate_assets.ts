import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { assetManifestSchema } from '../src/shared/asset_catalog';
import { validatedAssetFiles } from '../src/main/asset_files';
import { inspectSourceImage } from './image_metadata';

export function validateAssets(resourcesRoot:string,manifestFile=path.join(resourcesRoot,'asset_manifest.json')) {
 const manifest=assetManifestSchema.parse(JSON.parse(fs.readFileSync(manifestFile,'utf8'))),files=validatedAssetFiles(resourcesRoot,manifest);
 for(const r of Object.values(manifest.resources))if(r.file_state==='captured'){
  const info=inspectSourceImage(fs.readFileSync(files.get(r.id)!));assert.deepEqual([info.format,info.width,info.height],[r.format,r.width,r.height],'Image dimensions/format differ');
 }
 return {status:'passed',schema_version:manifest.schema_version,dataset_version:manifest.dataset_version,files:files.size,bindings:manifest.bindings.length,unresolved:manifest.unresolved.length,derived_defaults:manifest.bindings.filter(b=>b.selected&&b.variant==='bane'&&b.kind==='derived').length};
}
if(require.main===module){const args=process.argv.slice(2);if(args.length&&args.length!==2)throw new Error('Usage: assets:validate [--resources <packaged resources directory> | --manifest <candidate manifest>]');if(args[0]==='--resources')console.log(JSON.stringify(validateAssets(path.resolve(args[1])),null,2));else if(!args.length||args[0]==='--manifest')console.log(JSON.stringify(validateAssets(path.resolve('resources'),args.length?path.resolve(args[1]):undefined),null,2));else throw new Error('Unknown asset validation argument');}
