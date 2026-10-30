import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assetManifestSchema, type AssetManifest } from '../shared/asset_catalog';

// The renderer supplies only a catalog resource ID. Paths never come from a URL.
export function validatedAssetFiles(resourcesRoot:string,manifest:AssetManifest):Map<string,string> {
 const root=fs.realpathSync(resourcesRoot),files=new Map<string,string>();
 for(const [id,r]of Object.entries(manifest.resources))if(r.file_state==='captured') {
  assert.ok(r.path);const file=path.join(root,r.path.replace(/^resources\//,''));
  const actual=fs.realpathSync(file),relative=path.relative(root,actual);
  assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Asset escapes resource root');
  const bytes=fs.readFileSync(actual);assert.equal(bytes.length,r.bytes,'Asset size differs');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256,'Asset hash differs');files.set(id,actual);
 }
 return files;
}
export function loadAssetFiles(resourcesRoot:string) {
 const manifest=assetManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(resourcesRoot,'asset_manifest.json'),'utf8')));
 return {manifest,files:validatedAssetFiles(resourcesRoot,manifest)};
}
export function resolveAssetRequest(files:Map<string,string>,url:string,method='GET'):string|null {
 try {const u=new URL(url);if(method!=='GET'||u.protocol!=='loom-art:'||u.host!=='asset'||u.username||u.password||u.search||u.hash)return null;
 const id=decodeURIComponent(u.pathname.slice(1));if(!id||id.includes('/')||id.includes('\\'))return null;return files.get(id)??null;
 }catch{return null;}
}
