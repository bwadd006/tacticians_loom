import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import retainedIds from '../data/contracts/retained_core_ids.json';
import { sourceQuantity } from '../src/shared/reference_v3_transforms';
import { uiAssociationsSchema } from '../src/shared/reference_v3';
import { assetManifestSchema } from '../src/shared/asset_catalog';
import { inspectSourceImage } from './image_metadata';
import { canonicalDocumentSchema, manifestV2Schema, relativePathSchema, isField, TABLE_CONTRACTS,
  type CanonicalRecord, type CanonicalDocument, type Field, type RecordKind } from '../src/shared/reference_v3';

export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export function localFile(root: string, relative: string): string {
  relativePathSchema.parse(relative);
  const base = fs.realpathSync(root), result = fs.realpathSync(path.join(base, relative));
  assert.ok(result.startsWith(base + path.sep), `Path escapes application/capture boundary: ${relative}`);
  assert.ok(fs.statSync(result).isFile(), `Not a local file: ${relative}`);
  return result;
}
export function pointerValue(root: unknown, pointer: string): { present: boolean; value: unknown } {
  assert.ok(pointer === '' || pointer.startsWith('/'), `Invalid JSON pointer: ${pointer}`);
  let value = root;
  for (const encoded of pointer === '' ? [] : pointer.slice(1).split('/')) {
    assert.ok(!/~(?![01])/u.test(encoded), 'Invalid pointer escape');
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return { present: false, value: undefined };
    value = (value as Record<string, unknown>)[key];
  }
  return { present: true, value };
}
export const escapePointer = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');
export function fieldsIn(value: unknown, prefix = ''): { path: string; field: Field<unknown> }[] {
  if (isField(value)) return [{ path: prefix, field: value }];
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => fieldsIn(child, `${prefix}/${escapePointer(key)}`));
}

const families: Record<CanonicalDocument['family'], readonly RecordKind[]> = {
  identity: ['entities','entity_aliases','source_bindings'],
  context: ['routes','stats','skills','grades','contexts','context_routes','class_tiers','conditions','condition_children','record_conditions','time_assertions'],
  evidence: ['captures','source_documents','source_claims','claim_evidence','coverage','source_mentions','annotations'],
  characters: ['people','characters','character_identity','stat_profiles','stat_values','initial_skills','starting_states','loadout_entries','recruitment_events'],
  classes: ['classes','class_profiles','stat_profiles','stat_values','class_skills','class_certifications','class_rewards'],
  paralogues: ['activities','paralogues','activity_availability','activity_outcomes'],
  combat: ['people','actions','action_profiles','action_parameters','action_relations','learning_rules','learning_awards','crests','crest_profiles','crest_associations','blaze_types','blaze_type_profiles','blaze_associations','blessings','formulae','battalions','battalion_profiles','stat_profiles','stat_values'],
  social: ['support_pairs','support_variants','support_directional_claims','bird_prompts','bird_responses','bird_answers','social_subjects','preferences'],
  items: ['items','item_profiles','item_requirements','item_action_links','item_variants','recipes','recipe_inputs','containers','container_contents','acquisition_sources','stat_profiles','stat_values'],
  mounts: ['mounts','mount_profiles','progression_steps','stat_profiles','stat_values'],
  world: ['regions','locations','location_profiles','location_contexts','location_contents','shops','inventory_layers','shop_offers','acquisition_overrides','spatial_references','map_surfaces','map_categories','map_markers','map_tiles','map_geometries','marker_contexts','marker_categories'],
  assets: ['asset_resources','asset_sources','asset_bindings','asset_slices'],
};

export function loadReferenceV3(appRoot: string, manifestPath = 'data/dataset_manifest.json') {
  const manifestText = fs.readFileSync(localFile(appRoot, manifestPath), 'utf8');
  const manifest = manifestV2Schema.parse(JSON.parse(manifestText));
  const hashes: Record<string, string> = { [manifestPath]: sha256(manifestText) };
  const documents = manifest.documents.map(entry => {
    const text = fs.readFileSync(localFile(appRoot, entry.path), 'utf8');
    assert.equal(sha256(text), entry.sha256, `Maintained document hash: ${entry.path}`);
    hashes[entry.path] = entry.sha256;
    const document = canonicalDocumentSchema.parse(JSON.parse(text));
    assert.equal(document.family, entry.family, `Document family: ${entry.path}`);
    for (const record of document.records) assert.ok(families[entry.family].includes(record.record_kind), `${record.record_kind} does not belong in ${entry.family}`);
    return { ...entry, document, text };
  });
  const records = documents.flatMap(d => d.document.records);
  assert.equal(new Set(records.map(r=>r.id)).size,records.length,'Duplicate canonical record ID');
  const rows = <T extends Record<string,unknown> = Record<string,unknown>>(kind:RecordKind) => records.filter(r=>r.record_kind===kind).map(r=>r.body as T);
  const captureRows = new Map(rows('captures').map(b=>[b.id,b]));
  const sourceDocuments = new Map(rows('source_documents').map(body=>{
    assert.equal(body.body,null,'Maintained citations must not contain original document bodies');
    assert.equal(body.relative_path,null,'Maintained citations must not reference private files');
    assert.ok(captureRows.has(body.capture_id),'Unknown citation edition');
    return [String(body.id),{body,parsed:null,text:''}];
  }));
  validateV3Semantics(records, sourceDocuments);
  if(manifest.ui_associations) {
    const entry=manifest.ui_associations,text=fs.readFileSync(localFile(appRoot,entry.path),'utf8');assert.equal(sha256(text),entry.sha256,'UI association hash');hashes[entry.path]=entry.sha256;
    const associations=uiAssociationsSchema.parse(JSON.parse(text));
    for(const association of associations.entries) {
      assert.ok(records.some(r=>r.record_kind==='characters'&&r.body.id===association.characterId),'Unknown association character');
      const source=sourceDocuments.get(association.document_id);assert.ok(source&&captureRows.get(source.body.capture_id)?.source_role==='preferred','Association must cite preferred source');
      assert.ok(records.some(r=>r.record_kind==='source_claims'&&r.body.document_id===association.document_id&&r.body.source_pointer===association.source_pointer&&r.body.value_json===association.evidence),'Association effect differs from maintained evidence');
      const profiles=new Set(records.filter(r=>r.record_kind==='source_claims'&&r.body.document_id===association.document_id&&r.body.source_pointer===association.source_pointer&&r.body.field_path==='/effect_text').map(r=>r.body.record_id));
      const awards=new Set(records.filter(r=>r.record_kind==='learning_awards'&&r.body.character_id===association.characterId&&r.body.acquired_label===association.abilityName).map(r=>r.id));
      assert.ok(records.some(r=>r.record_kind==='source_mentions'&&awards.has(String(r.body.record_id))&&profiles.has((r.body.context_json as {profile_record_id?:string}).profile_record_id)),'Association effect belongs to another character/acquisition');
    }
  }
  if(manifest.runtime_assets) {
    const entry=manifest.runtime_assets,text=fs.readFileSync(localFile(appRoot,entry.path),'utf8');
    assert.equal(sha256(text),entry.sha256,'Runtime asset manifest hash');hashes[entry.path]=entry.sha256;
    const assets=assetManifestSchema.parse(JSON.parse(text));assert.equal(assets.dataset_version,manifest.dataset_version,'Runtime asset dataset');
    const resources=new Map(rows('asset_resources').map(r=>[String(r.id),r]));
    const entityIds=new Set(rows('entities').map(r=>r.id)),recordIds=new Set(records.map(r=>r.id));
    for(const a of Object.values(assets.resources)) {
      const r=resources.get(a.id);assert.ok(r,'Runtime asset absent from canonical registry');
      assert.deepEqual([r.sha256,r.relative_path,r.byte_count,r.format,r.width_px,r.height_px,r.file_state,r.derived_state],[a.sha256,a.path,a.bytes,a.format,a.width,a.height,a.file_state,a.derived_state],'Runtime/canonical asset mismatch');
    }
    const skillIds=new Set(rows('skills').map(r=>r.id));
    const bindingKey=(b:Record<string,unknown>)=>JSON.stringify([b.resource_id,b.subject_entity_id,b.subject_record_id,b.role,b.variant_json,b.binding_kind,b.resolution]);
    const canonicalBindings=new Set(rows('asset_bindings').map(bindingKey));
    for(const b of assets.bindings){
      if(b.subject_entity_id)assert.ok(entityIds.has(b.subject_entity_id),'Unknown artwork owner');if(b.subject_skill_id)assert.ok(skillIds.has(b.subject_skill_id),'Unknown artwork skill');if(b.subject_record_id)assert.ok(recordIds.has(b.subject_record_id),'Unknown artwork record');
      assert.ok(canonicalBindings.has(bindingKey({resource_id:b.resource_id,subject_entity_id:b.subject_entity_id,subject_record_id:b.subject_record_id,role:b.selected?b.role:'catalog_or_previous_'+b.role,variant_json:b.variant?{label:b.variant}:{},binding_kind:b.kind,resolution:b.kind==='placeholder'?'placeholder':'mapped'})),'Runtime/canonical artwork binding mismatch');
    }
  }
  for(const record of records.filter(r=>r.record_kind==='asset_resources' && r.body.file_state==='captured')) {
    const bytes=fs.readFileSync(localFile(appRoot,String(record.body.relative_path)));
    assert.equal(sha256(bytes),record.body.sha256,'Captured asset hash');
    assert.equal(bytes.length,record.body.byte_count,'Captured asset byte count');
    const actual=inspectSourceImage(bytes);assert.deepEqual([actual.format,actual.width,actual.height],[record.body.format,record.body.width_px,record.body.height_px],'Captured asset dimensions/format');
  }
  const entityRows = new Map(rows('entities').map(b => [b.id, b]));
  for (const core of retainedIds) assert.equal(entityRows.get(core.id)?.kind, core.kind, `Missing/changed retained identity ${core.id}`);
  return { manifest, manifestText, documents, records, hashes, sourceDocuments };
}

export function validateV3Semantics(records: CanonicalRecord[], sources: Map<string, { body: Record<string, unknown>; parsed: unknown; text: string }>) {
  const byId = new Map(records.map(r => [r.id, r]));
  const buckets=new Map<RecordKind,Record<string,unknown>[]>();
  for(const record of records) {if(!buckets.has(record.record_kind))buckets.set(record.record_kind,[]);buckets.get(record.record_kind)!.push(record.body);}
  const rows = (kind: RecordKind) => buckets.get(kind)??[];
  const entities = new Map(rows('entities').map(b => [b.id, b]));
  const contexts = new Map(rows('contexts').map(b => [b.id, b]));
  const claims = new Map(rows('source_claims').map(b => [String(b.id), b]));
  const captures = new Map(rows('captures').map(b => [b.id, b]));
  const evidenceByClaim=new Map<unknown,Record<string,unknown>[]>();
  for(const evidence of rows('claim_evidence')) {if(!evidenceByClaim.has(evidence.claim_id))evidenceByClaim.set(evidence.claim_id,[]);evidenceByClaim.get(evidence.claim_id)!.push(evidence);}
  const aliases=new Set(rows('entity_aliases').filter(b=>b.origin!=='legacy_label').map(b=>`${b.entity_id}\u0000${b.alias}`));
  // Check all references before SQL. Composite constraints and exact cardinalities are also checked by SQLite.
  const keys = new Map<string, Set<unknown>>();
  for (const record of records) for (const column of TABLE_CONTRACTS[record.record_kind].columns) {
    const key = `${record.record_kind}.${column.name}`;
    if (!keys.has(key)) keys.set(key, new Set());
    keys.get(key)!.add(column.name === 'record_id' && TABLE_CONTRACTS[record.record_kind].extension ? record.id : record.body[column.name]);
  }
  keys.set('records.id', new Set(byId.keys()));
  for (const record of records) {
    if (record.entity_id !== null) assert.ok(entities.has(record.entity_id), `Unknown record entity ${record.entity_id}`);
    if (record.context_id !== null) assert.ok(contexts.has(record.context_id), `Unknown record context ${record.context_id}`);
    for (const fk of TABLE_CONTRACTS[record.record_kind].foreign_keys) {
      const field = record.body[fk.column];
      const value = isField(field) ? field.value : field;
      if (value === null || (fk.column === 'record_id' && TABLE_CONTRACTS[record.record_kind].extension)) continue;
      assert.ok(keys.get(`${fk.table}.${fk.target}`)?.has(value), `Dangling ${record.record_kind}.${fk.column}: ${value}`);
    }
  }
  const pairedStates: Partial<Record<RecordKind,Record<string,string>>>={stat_values:{number_value:'value_state'},initial_skills:{grade_id:'grade_state',affinity:'affinity_state'}};
  for(const record of records) {
    for(const [column,stateColumn] of Object.entries(pairedStates[record.record_kind] ?? {})) {
      const field=record.body[column];assert.ok(isField(field));assert.equal(field.state,record.body[stateColumn],`Field state/helper mismatch ${record.id}`);
    }
    const body=record.body;
    if(['action_parameters','loadout_entries'].includes(record.record_kind)) {
      const quantity=body.quantity_json as {qualifier:string;number:number|null;unit:string|null};
      const field=body[record.record_kind==='action_parameters'?'numeric_value':'quantity_value'];assert.ok(isField(field));
      assert.equal(field.value,quantity.qualifier==='exact'?quantity.number:null,'Quantity/helper mismatch');
      if(record.record_kind==='action_parameters') assert.equal(body.unit,quantity.unit,'Quantity unit mismatch');
    }
    if(['acquisition_sources','container_contents'].includes(record.record_kind)) {
      const probability=body.probability_value;assert.ok(isField(probability));assert.equal(probability.state,body.probability_state,'Probability state mismatch');
    }
    if(record.record_kind==='conditions') {
      const payload=body.value_json as Record<string,unknown>;
      if(payload.kind==='skill_grade') {assert.ok(keys.get('skills.id')?.has(payload.skill_id),'Unknown condition skill');assert.ok(keys.get('grades.id')?.has(payload.grade_id),'Unknown condition grade');}
      if(payload.kind==='entity' && payload.target_id!==null) assert.equal(entities.get(payload.target_id)?.kind,payload.target_kind,'Condition target kind mismatch');
    }
    if(record.record_kind==='source_mentions') {
      assert.equal(body.resolution==='mapped',body.target_entity_id!==null,'Mention resolution/target mismatch');
      if(body.target_entity_id!==null && body.target_kind!==null) assert.equal(entities.get(body.target_entity_id)?.kind,body.target_kind,'Mention target kind mismatch');
      const context=body.context_json as {profile_record_id?:string};
      if(context.profile_record_id) {const profile=byId.get(context.profile_record_id);assert.equal(profile?.record_kind,'action_profiles','Effect profile link kind');assert.equal(profile.body.action_id,body.target_entity_id,'Effect profile belongs to another action');}
    }
    if(record.record_kind==='source_bindings') assert.equal(body.resolution==='mapped',body.entity_id!==null,'Binding resolution/target mismatch');
  }
  const domainKinds: Partial<Record<RecordKind, string[]>> = {
    characters: ['character'], people: ['character','person','deity'], classes: ['class'], paralogues: ['paralogue'],
    activities: ['paralogue','activity'], actions: ['ability','combat_art','spell','blaze_art','blaze_ability','gambit'],
    items: ['item','weapon','equipment','material','scroll','license'], crests: ['crest'], blaze_types: ['blaze_type'],
    mounts: ['mount_species','mount_variant'], battalions: ['battalion'],
    bird_responses: ['bird_response'], social_subjects: ['social_subject','item','location','activity'],
    regions: ['region'], locations: ['location'], containers: ['container','item'],
  };
  for (const [kind, allowed] of Object.entries(domainKinds)) for (const b of rows(kind as RecordKind)) assert.ok(allowed.includes(String(entities.get(b.id)?.kind)), `Wrong entity kind for ${kind}:${b.id}`);
  for (const b of rows('actions')) assert.equal(entities.get(b.id)?.kind, b.action_kind, 'Action identity kind differs');
  for (const b of rows('contexts')) {
    const routes = rows('context_routes').filter(r => r.context_id === b.id);
    assert.equal(b.route_scope === 'listed', routes.length > 0, `Context route scope contradicts list ${b.id}`);
    assert.ok(b.chapter_low === null || b.chapter_high === null || Number(b.chapter_low) <= Number(b.chapter_high), 'Reversed chapter interval');
  }
  const nodes = new Map(rows('conditions').map(b => [b.id, b]));
  const visiting = new Set<unknown>(), done = new Set<unknown>();
  const children = rows('condition_children');
  function visit(id: unknown) {
    assert.ok(!visiting.has(id), `Condition cycle at ${id}`); if (done.has(id)) return;
    visiting.add(id); const node = nodes.get(id)!; const edges = children.filter(b => b.parent_id === id);
    assert.ok(node.node_kind !== 'leaf' || edges.length === 0, 'Leaf cannot contain children');
    assert.ok(node.node_kind !== 'not' || edges.length === 1, 'NOT condition requires one child');
    assert.ok(!['all','any'].includes(String(node.node_kind)) || edges.length > 0, 'Empty AND/OR does not grant permission');
    const payload = node.value_json as {kind: string};
    assert.equal(payload.kind === 'group', ['all','any','not','unspecified'].includes(String(node.node_kind)), 'Condition payload/group mismatch');
    for (const edge of edges) visit(edge.child_id);
    visiting.delete(id); done.add(id);
  }
  for (const id of nodes.keys()) visit(id);
  const inventory=records.filter(r=>r.record_kind==='inventory_layers');
  for(const layer of inventory) {
    const seen=new Set<string>();let current:CanonicalRecord|undefined=layer;
    while(current) {assert.ok(!seen.has(current.id),'Inventory inheritance cycle');seen.add(current.id);current=inventory.find(r=>r.id===current?.body.parent_layer_id);}
  }
  const supportPairs=new Map(rows('support_pairs').map(b=>[b.id,b]));
  for(const directional of rows('support_directional_claims')) {
    const pair=supportPairs.get(directional.pair_id)!;
    assert.deepEqual([directional.from_person_id,directional.to_person_id].sort(),[pair.person_low_id,pair.person_high_id].sort(),'Directional support/pair mismatch');
  }
  for (const claim of claims.values()) {
    const source = sources.get(String(claim.document_id)); assert.ok(source, `Unknown source document ${claim.document_id}`);
    if (claim.origin === 'preferred_source') assert.equal(captures.get(source.body.capture_id)?.source_role, 'preferred', 'Preferred claim cites legacy/supplemental capture');
    assert.ok(typeof claim.source_pointer==='string','Evidence requires a source locator');
    if(claim.value_state==='source_null'||claim.value_state==='source_missing')assert.equal(claim.value_json,null,'Unknown source value');
    if(claim.value_state==='value')assert.notEqual(claim.value_json,null,'Known source value');
  }
  for(const evidence of rows('claim_evidence')) assert.ok(sources.has(String(evidence.evidence_document_id)),'Missing evidence citation');

  for (const record of records) for (const {path: fieldPath, field} of fieldsIn(record.body)) {
    for (const id of field.claim_ids) {
      const claim = claims.get(id); assert.ok(claim, `Unknown field claim ${id}`);
      assert.equal(claim.record_id, record.id, 'Claim belongs to another record');
      assert.equal(claim.field_path, fieldPath, 'Claim belongs to another field');
    }
    if (field.selected_claim_id === null) continue;
    const claim = claims.get(field.selected_claim_id)!;
    assert.equal(claim.origin, 'preferred_source', 'Legacy/supplemental evidence cannot fill preferred baseline');
    assert.equal(claim.value_state, field.state, 'Selection state differs from claim');
    if (!isDeepStrictEqual(field.value, claim.value_json)) {
      // Alias resolution and semantic interpretation are explicit, evidenced transforms, never arbitrary casts.
      const evidence = evidenceByClaim.get(claim.id)??[];
      const alias = typeof field.value==='string'&&typeof claim.value_json==='string'&&aliases.has(`${field.value}\u0000${claim.value_json}`);
      const quantity = field.value !== null && typeof field.value === 'object' && 'raw' in field.value && 'unit' in field.value && isDeepStrictEqual(field.value.raw, claim.value_json)
        && isDeepStrictEqual(field.value,sourceQuantity(claim.value_json as string|number|null,typeof field.value.unit==='string'?field.value.unit:null));
      const reportedUse=record.record_kind==='class_skills' && fieldPath==='/access_state' && field.value==='reported' && typeof claim.value_json==='number'
        && claim.semantic_role==='class_skill_use' && evidence.some(b=>b.role==='source_semantics');
      const literal=claim.semantic_role==='source_literal' && typeof field.value==='string' && JSON.stringify(claim.value_json)===field.value;
      const affinity=claim.semantic_role==='affinity_label' && typeof claim.value_json==='string' && ['Boon','Bane','Neutral'].includes(claim.value_json) && claim.value_json.toLowerCase()===field.value;
      const recruitment=claim.semantic_role==='recruitment_kind' && record.record_kind==='recruitment_events' && fieldPath==='/join_kind'
        && typeof claim.value_json==='string' && (claim.value_json==='Starting'?field.value==='automatic':/^Chapter \d+$/u.test(claim.value_json)&&field.value==='recruitable');
      const sourceListing=claim.semantic_role==='source_map_listing' && ['activity_availability','location_contexts'].includes(record.record_kind) && ['available','listed'].includes(String(field.value)) && typeof claim.value_json==='object' && claim.value_json!==null;
      const neutral=claim.semantic_role==='neutral_affinity'&&record.record_kind==='initial_skills'&&fieldPath==='/affinity'&&field.value==='neutral'&&claim.value_json!==null&&typeof claim.value_json==='object'&&!Object.hasOwn(claim.value_json,'affinity')&&evidence.some(b=>b.role==='source_semantics');
      const thresholdScope=claim.semantic_role==='recruitment_threshold_scope'&&record.record_kind==='recruitment_events'&&fieldPath==='/join_kind'&&field.value==='recruitable'&&typeof claim.value_json==='number'&&evidence.some(b=>b.role==='source_semantics');
      const preference=claim.semantic_role==='preference_tier'&&record.record_kind==='preferences'&&String(claim.source_pointer).split('/').at(-2)?.replace(/_(?:gifts|meals|plays|temples)$/u,'')===field.value;
      const usage=claim.semantic_role==='weapon_usage_tag'&&[1,2].includes(Number(claim.value_json))&&field.value===(claim.value_json===1?'enemy_only':'npc_only')&&evidence.some(b=>b.role==='source_semantics');
      const weaponCategory=claim.semantic_role==='weapon_category'&&record.record_kind==='item_profiles'&&decodeURIComponent(String(claim.source_pointer).split('/')[2]).replace(/~1/g,'/').replace(/~0/g,'~')===field.value;
      const support=claim.semantic_role==='support_level_phrase'&&record.record_kind==='support_variants'&&fieldPath==='/numeric_support_threshold'&&typeof claim.value_json==='string'&&Number(/Support level (\d+)/u.exec(claim.value_json)?.[1])===field.value;
      const date=claim.semantic_role===`source_date_${fieldPath.slice(1)}`&&record.record_kind==='time_assertions'&&typeof claim.value_json==='string'?/^(\d{1,2})\/(\d{1,2})(?:-(\d{1,2})\/(\d{1,2}))?$/u.exec(claim.value_json):null;
      const dateIndex:Record<string,number>={start_month:1,start_day:2,end_month:date?.[3]?3:1,end_day:date?.[4]?4:2};
      const datePart=date&&Number(date[dateIndex[fieldPath.slice(1)]])===field.value;
      const pointerKey=claim.semantic_role==='pointer_key'&&record.record_kind==='annotations'&&field.value===String(claim.source_pointer).split('/').at(-1)?.replace(/~1/g,'/').replace(/~0/g,'~');
      const numericLexeme=claim.semantic_role==='numeric_lexeme' && typeof claim.value_json==='string' && typeof field.value==='number' && sourceQuantity(claim.value_json,null).number===field.value;
      const parameterQuantity=record.body.quantity_json as {raw:unknown;unit:string|null}|undefined;
      const quantityNumber=claim.semantic_role==='quantity_number'&&record.record_kind==='action_parameters'&&fieldPath==='/numeric_value'&&parameterQuantity&&isDeepStrictEqual(parameterQuantity.raw,claim.value_json)
        &&sourceQuantity(claim.value_json as string|number|null,parameterQuantity.unit).number===field.value;
      const chapter=claim.semantic_role==='chapter_label' && record.record_kind==='recruitment_events' && fieldPath==='/chapter_value' && typeof claim.value_json==='string'
        ? /^(?:Chapter|Ch\.?)\s*(\d+)$/iu.exec(claim.value_json) : null;
      const percentage=claim.semantic_role==='probability_percent' && ['acquisition_sources','container_contents'].includes(record.record_kind) && fieldPath==='/probability_value' && typeof claim.value_json==='string'
        ? /^(\d+(?:\.\d+)?)%$/u.exec(claim.value_json) : null;
      assert.ok(alias || quantity || quantityNumber || reportedUse || literal || affinity || neutral || thresholdScope || preference || usage || weaponCategory || support || datePart || pointerKey || recruitment || sourceListing || numericLexeme || (chapter && Number(chapter[1])===field.value)
        || (percentage && Number(percentage[1])<=100 && Number(percentage[1])/100===field.value), `Unevidenced transform ${record.id}${fieldPath}`);
    }
  }
}

export function referenceV3Coverage(records:CanonicalRecord[]) {
  const facts=records.flatMap(r=>fieldsIn(r.body));
  const counts=(values:string[])=>Object.fromEntries([...new Set(values)].sort().map(v=>[v,values.filter(x=>x===v).length]));
  const claims=records.filter(r=>r.record_kind==='source_claims');
  const selectedIds=new Set(facts.map(f=>f.field.selected_claim_id));
  return {record_count:records.length,record_kinds:counts(records.map(r=>r.record_kind)),field_states:counts(facts.map(f=>f.field.state)),
    claim_origins:counts(claims.map(r=>String(r.body.origin))),evidence_states:counts(claims.map(r=>String(r.body.evidence_state))),
    selected_fields:facts.filter(f=>f.field.selected_claim_id!==null).length,unselected_claims:claims.filter(c=>!selectedIds.has(String(c.body.id))).length};
}
