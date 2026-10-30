import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const roots=new Set(['src','scripts','tests','data','database','resources']);
// Keep source exports explicit so application documentation travels with the code.
const rootFiles=new Set(['.gitignore','.npmignore','.npmrc','readme.md','change_log.md','package.json','package-lock.json','tsconfig.json','forge_config.ts','webpack_main_config.ts','webpack_renderer_config.ts','webpack_rules.ts']);
const ignored=new Set(['.git','node_modules','.webpack','out']);
const privatePath=/(^|\/)(imports|review|design_docs|raw|inventory|derived|i[0-6])\/|(^|\/)(?:capture_yuphas_source|inventory_yuphas_source|import_yuphas_baseline|review_yuphas_candidate|activate_yuphas_baseline|activate_asset_catalog)\.[^/]+$|(^|\/)i[0-6]_[^/]+/i;
export function distributionFiles(root:string):string[] {
 const files:string[]=[];
 const walk=(dir:string,relative='')=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const name=relative?`${relative}/${entry.name}`:entry.name;
  if(!relative&&ignored.has(entry.name))continue;
  if(name==='database/generated'||name.endsWith('.log'))continue;
  assert.ok(!privatePath.test(name),`Private acquisition material inside application: ${name}`);
  assert.ok(relative||roots.has(entry.name)||rootFiles.has(entry.name),`Unrecognized application file: ${name}`);
  if(!entry.isDirectory()&&relative){
   const extension=path.extname(name);
   assert.ok(
    name.startsWith('src/')?['.ts','.tsx','.css','.html'].includes(extension):
    name.startsWith('tests/')||name.startsWith('scripts/')?extension==='.ts':
    name.startsWith('data/')?extension==='.json':
    name.startsWith('database/')?extension==='.sql':
    name.startsWith('resources/')?['.json','.png','.webp'].includes(extension):false,
    `Unexpected application content: ${name}`);
  }
  assert.ok(!entry.isSymbolicLink(),`Distribution cannot include symlinks: ${name}`);
  if(entry.isDirectory())walk(path.join(dir,entry.name),name);else files.push(name);
 }};walk(root);return files.sort();
}
export function validateDistributionBoundary(root:string) {
 const files=distributionFiles(root);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/dataset_manifest.json'),'utf8'));
 assert.ok(!('capture_manifests'in manifest),'Application manifest must be independent of acquisition archives');
 const maintained=new Set(['data/dataset_manifest.json','data/ability_associations.json','data/contracts/reference_v3_tables.json','data/contracts/retained_core_ids.json',...manifest.documents.map((d:{path:string})=>d.path)]);
 for(const name of files.filter(f=>f.startsWith('data/')))assert.ok(maintained.has(name),`Unregistered maintained input: ${name}`);
 for(const document of manifest.documents){
  assert.match(document.path,/^data\/source\/[a-z_]+\.json$/);
  const data=JSON.parse(fs.readFileSync(path.join(root,document.path),'utf8'));
  for(const r of data.records)if(r.record_kind==='source_documents'){
   assert.equal(r.body.body,null,'Original source bodies cannot be distributed');assert.equal(r.body.relative_path,null,'Private source paths cannot be distributed');
  }
 }
 return {status:'passed',files:files.length};
}
if(require.main===module)console.log(JSON.stringify(validateDistributionBoundary(process.cwd())));
