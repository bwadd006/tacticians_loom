import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { loadSqlite } from '../src/main/database/sqlite';
import { canonicalRecordSchema, TABLE_CONTRACTS, indexedValue, type CanonicalRecord, type RecordKind } from '../src/shared/reference_v3';
import { fieldsIn, loadReferenceV3, sha256, validateV3Semantics, referenceV3Coverage } from './reference_v3_sources';
import { getClassLibraryV3, getParalogueLibraryV3, getCharacterV3 } from '../src/main/database/reference_v3_queries';

export const recordDigest=(records:CanonicalRecord[])=>sha256(JSON.stringify([...records].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)));
type SqlValue = string | number | null;
const encode = (column: string, value: unknown): SqlValue => column.endsWith('_json') ? JSON.stringify(value) : value as SqlValue;
export function normalizedRow(record: CanonicalRecord, sourceText?: string): Record<string, SqlValue> {
  return Object.fromEntries(TABLE_CONTRACTS[record.record_kind].columns.map(c => [c.name,
    c.name === 'record_id' && TABLE_CONTRACTS[record.record_kind].extension ? record.id
      : record.record_kind === 'source_documents' && c.name === 'body' ? sourceText ?? record.body.body as SqlValue
        : encode(c.name, indexedValue(record.record_kind, c.name, record.body[c.name]))]));
}
const readMetadata = (db: Database.Database, key: string) => {
  const row = db.prepare('SELECT value_json FROM build_metadata WHERE key=?').get(key) as {value_json: string} | undefined;
  return row ? JSON.parse(row.value_json) : null;
};
export function recordDiff(previous: CanonicalRecord[], next: CanonicalRecord[]) {
  const before = new Map(previous.map(r => [r.id, r]));
  const after = new Map(next.map(r => [r.id, r]));
  const fields: {record_id: string; field_path: string; status: string; previous: unknown; current: unknown}[] = [];
  const withoutFacts=(value:unknown):unknown => value!==null&&typeof value==='object' ? ('selected_claim_id' in value ? '<selected field>' : Array.isArray(value) ? value.map(withoutFacts) : Object.fromEntries(Object.entries(value).map(([k,v])=>[k,withoutFacts(v)]))) : value;
  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const old = before.get(id), current = after.get(id);
    if (!old || !current) { fields.push({record_id:id, field_path:'', status: old ? 'removed' : 'added', previous:old ?? null, current:current ?? null}); continue; }
    const paths = new Set([...fieldsIn(old.body).map(f => f.path), ...fieldsIn(current.body).map(f => f.path)]);
    if (JSON.stringify(withoutFacts(old)) !== JSON.stringify(withoutFacts(current))) fields.push({record_id:id, field_path:'', status:'metadata_changed', previous:withoutFacts(old), current:withoutFacts(current)});
    for (const pointer of paths) {
      const a = fieldsIn(old.body).find(f => f.path === pointer)?.field ?? null;
      const b = fieldsIn(current.body).find(f => f.path === pointer)?.field ?? null;
      fields.push({record_id:id, field_path:pointer, status:JSON.stringify(a) === JSON.stringify(b) ? 'match' : b?.state === 'unresolved' ? 'unresolved_semantics' : b?.state === 'source_missing' ? 'source_gap' : 'selected_value_changed', previous:a, current:b});
    }
  }
  const claims = next.filter(r => r.record_kind === 'source_claims');
  const claimsById=new Map(claims.map(c=>[String(c.body.id),c.body]));
  const selected=next.flatMap(record=>fieldsIn(record.body).map(f=>({record_id:record.id,field_path:f.path,state:f.field.state,value:f.field.value,
    selected_claim:claimsById.get(f.field.selected_claim_id??'') ?? null,alternatives:f.field.claim_ids.filter(id=>id!==f.field.selected_claim_id).map(id=>claimsById.get(id)!)})));
  return { fields, selected, counts: { added:fields.filter(f => f.status === 'added').length, removed:fields.filter(f => f.status === 'removed').length,
    matches:fields.filter(f => f.status === 'match').length, changed:fields.filter(f => f.status.endsWith('changed')).length,
    source_gaps:fields.filter(f => f.status === 'source_gap').length, unresolved:fields.filter(f => f.status === 'unresolved_semantics').length,
    legacy_claims:claims.filter(r => r.body.origin === 'legacy').length, comparable_conflicts:claims.filter(r => r.body.evidence_state === 'conflicting').length } };
}

export function validateReferenceV3(db: Database.Database) {
  assert.equal(db.pragma('user_version', { simple:true }), 3);
  assert.equal(db.pragma('integrity_check', { simple:true }), 'ok');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  const records = (db.prepare('SELECT * FROM records ORDER BY id').all() as {id: string; record_kind: string; entity_id: string|null; context_id:string|null; body_json:string}[])
    .map(r => canonicalRecordSchema.parse({id:r.id,record_kind:r.record_kind,entity_id:r.entity_id,context_id:r.context_id,body:JSON.parse(r.body_json)}));
  assert.equal(recordDigest(records),readMetadata(db,'record_content_sha256'),'Canonical record content differs from build');
  const sources = new Map(records.filter(r=>r.record_kind==='source_documents').map(r=>{
    assert.equal(r.body.body,null,'Raw source documents cannot ship');assert.equal(r.body.relative_path,null,'Private paths cannot ship');
    return [String(r.body.id),{body:r.body,parsed:null,text:''}];
  }));
  validateV3Semantics(records, sources);
  const counts: Record<string, number> = {};
  for (const kind of Object.keys(TABLE_CONTRACTS) as RecordKind[]) {
    const matching = records.filter(r => r.record_kind === kind);
    const rows = db.prepare(`SELECT * FROM "${kind}"`).all() as Record<string, SqlValue>[];
    assert.equal(rows.length, matching.length, `Normalized count ${kind}`); counts[kind] = rows.length;
    const stable = (row: Record<string, SqlValue>) => JSON.stringify(Object.entries(row).sort(([a],[b]) => a.localeCompare(b)));
    const projected = matching.map(r => normalizedRow(r, kind === 'source_documents' ? undefined : undefined));
    assert.deepEqual(rows.map(stable).sort(), projected.map(stable).sort(), `Normalized column/body mismatch: ${kind}`);
  }
  const selections = records.flatMap(r => fieldsIn(r.body).map(f => ({ record_id:r.id, field_path:f.path, claim_id:f.field.selected_claim_id,
    selection_state:f.field.state, reason:f.field.reason ?? 'Selected reported preferred-source claim' })));
  const actual = db.prepare('SELECT * FROM field_selections ORDER BY record_id,field_path').all();
  assert.deepEqual(actual, selections.sort((a,b) => a.record_id < b.record_id ? -1 : a.record_id > b.record_id ? 1 : a.field_path < b.field_path ? -1 : a.field_path > b.field_path ? 1 : 0), 'Field selection/body mismatch');
  // Exercise the same typed operations used by preload before publishing a candidate.
  for(const row of db.prepare('SELECT id FROM characters').all() as {id:string}[]) getCharacterV3(db,row.id);
  getClassLibraryV3(db);getParalogueLibraryV3(db);
  assert.deepEqual(readMetadata(db,'coverage_report'),referenceV3Coverage(records),'Coverage report differs from canonical records');
  return { validation:'passed', overview:{ recordCount:records.length, counts } };
}

export function buildReferenceV3(appRoot: string, outputFile: string, manifestPath = 'data/dataset_manifest.json',previousFile=outputFile) {
  const input = loadReferenceV3(appRoot, manifestPath);
  const defaultOutput = path.join(appRoot, 'database/generated/reference.sqlite');
  if (input.manifest.release_status === 'candidate') assert.notEqual(path.resolve(outputFile), path.resolve(defaultOutput), 'Candidate builds require a separate output path');
  const schema = fs.readFileSync(path.join(appRoot, 'database/reference_schema_v3.sql'), 'utf8');
  const fingerprint = sha256(JSON.stringify({hashes:input.hashes,schema:sha256(schema)}));
  const Sqlite = loadSqlite(); let previous: CanonicalRecord[] = [];
  if (fs.existsSync(previousFile)) {
    const old = new Sqlite(previousFile, {readonly:true, fileMustExist:true});
    try {
      if (readMetadata(old,'dataset_version') === input.manifest.dataset_version) assert.equal(readMetadata(old,'input_fingerprint'), fingerprint, 'Input bytes changed: bump dataset_version and update change_summary');
      if (old.pragma('user_version', {simple:true}) === 3) {
        previous = (old.prepare('SELECT * FROM records').all() as {id:string;record_kind:RecordKind;entity_id:string|null;context_id:string|null;body_json:string}[])
          .map(r => ({id:r.id,record_kind:r.record_kind,entity_id:r.entity_id,context_id:r.context_id,body:JSON.parse(r.body_json)}));
        const nextEntities = new Map(input.records.filter(r => r.record_kind === 'entities').map(r => [r.body.id,r.body]));
        for (const r of previous.filter(r => r.record_kind === 'entities')) {
          const next = nextEntities.get(r.body.id); assert.ok(next, `Identity removed without tombstone: ${r.body.id}`);
          assert.equal(next.kind,r.body.kind,'Existing identity kind changed'); assert.equal(next.namespace,r.body.namespace,'Existing identity namespace changed');
        }
      }

    } finally { old.close(); }
  }
  const changeReport = recordDiff(previous,input.records);
  fs.mkdirSync(path.dirname(outputFile), {recursive:true});
  const candidate = `${outputFile}.${randomUUID()}.tmp`; let db: Database.Database | undefined;
  try {
    db = new Sqlite(candidate); db.exec(schema); const database = db;
    database.transaction(() => {
      database.pragma('defer_foreign_keys = ON');
      const insert = (table: string, values: Record<string, SqlValue>) => database.prepare(`INSERT INTO "${table}" (${Object.keys(values).map(k => `"${k}"`).join(',')}) VALUES (${Object.keys(values).map(() => '?').join(',')})`).run(...Object.values(values));
      for (const r of input.records) insert('records',{id:r.id,record_kind:r.record_kind,entity_id:r.entity_id,context_id:r.context_id,body_json:JSON.stringify(r.body)});
      // Origin triggers require capture and source-document rows before claims. Other links are deferred until commit.
      const order = (k:RecordKind) => k === 'captures' ? 0 : k === 'source_documents' ? 1 : k === 'source_claims' ? 3 : 2;
      for (const r of [...input.records].sort((a,b) => order(a.record_kind)-order(b.record_kind))) insert(r.record_kind,normalizedRow(r,undefined));
      for (const r of input.records) for (const f of fieldsIn(r.body)) insert('field_selections',{record_id:r.id,field_path:f.path,claim_id:f.field.selected_claim_id,selection_state:f.field.state,reason:f.field.reason ?? 'Selected reported preferred-source claim'});
      const metadata = { dataset_version:input.manifest.dataset_version, change_summary:input.manifest.change_summary, reference_schema_version:3, importer_version:input.manifest.importer_version, release_status:input.manifest.release_status,
        record_content_sha256:recordDigest(input.records),input_fingerprint:fingerprint,source_hashes:input.hashes,schema_sha256:sha256(schema),manifest:input.manifestText,
        built_at:new Date().toISOString(),coverage_report:referenceV3Coverage(input.records) };
      for (const [key,value] of Object.entries(metadata)) insert('build_metadata',{key,value_json:JSON.stringify(value)});
    })();
    const validation = validateReferenceV3(database);
    database.prepare('INSERT INTO build_metadata VALUES (?,?)').run('validation',JSON.stringify('passed'));
    database.close(); db = undefined;
    fs.renameSync(candidate,outputFile);
    return {...validation, outputFile, changeReport};
  } finally { db?.close(); fs.rmSync(candidate,{force:true}); }
}
