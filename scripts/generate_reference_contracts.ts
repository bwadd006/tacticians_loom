import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadSqlite } from '../src/main/database/sqlite';

// Materialize only the storage grammar. Domain semantics and JSON/Field validators
// remain explicit TypeScript contracts, independently tested against this grammar.
const args=process.argv.slice(2);
assert.ok(args.length===1&&['--check','--write'].includes(args[0]),'Use --check or --write');
const Sqlite=loadSqlite(),db=new Sqlite(':memory:');
try {
  db.exec(fs.readFileSync(path.join(process.cwd(),'database/reference_schema_v3.sql'),'utf8'));
  const internal=new Set(['records','field_selections','compatibility_projections','build_metadata']);
  const tables=(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string}[]).filter(t=>!internal.has(t.name));
  const result=Object.fromEntries(tables.map(({name})=>{
    const columns=(db.pragma(`table_info("${name}")`) as {name:string;type:string;notnull:number;pk:number}[]).map(c=>({name:c.name,type:c.type,nullable:!c.notnull,primary:!!c.pk}));
    const foreign_keys=(db.pragma(`foreign_key_list("${name}")`) as {from:string;table:string;to:string}[]).map(c=>({column:c.from,table:c.table,target:c.to}));
    return [name,{columns,foreign_keys,extension:columns.filter(c=>c.primary).length===1&&columns.some(c=>c.primary&&c.name==='record_id')}];
  }));
  const filename=path.join(process.cwd(),'data/contracts/reference_v3_tables.json');
  if(args[0]==='--write') fs.writeFileSync(filename,JSON.stringify(result,null,2)+'\n');
  else assert.deepEqual(JSON.parse(fs.readFileSync(filename,'utf8')),result,'Schema/storage grammar drift; review semantics before regenerating');
  console.log(`Reference v3 storage contracts ${args[0]==='--check'?'verified':'written'}: ${tables.length} input record kinds.`);
}finally{db.close();}
