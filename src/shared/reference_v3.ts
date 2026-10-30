import { z } from 'zod';
import definitions from '../../data/contracts/reference_v3_tables.json';
import { SKILLS } from './catalog';

export const REFERENCE_V3 = 3;
export const IMPORTER_V3 = '3.3.0';
export const TABLE_CONTRACTS = definitions;
export type RecordKind = keyof typeof definitions;
export const idSchema = z.string().min(1).max(200);
export const valueStates = ['value', 'source_null', 'source_missing', 'unresolved', 'not_applicable'] as const;
export const fieldSchema = <T extends z.ZodType>(value: T) => z.object({
  state: z.enum(valueStates), value: value.nullable(), claim_ids: z.array(idSchema),
  selected_claim_id: idSchema.nullable(), reason: z.string().nullable(),
}).strict().superRefine((field, ctx) => {
  if (new Set(field.claim_ids).size !== field.claim_ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate field claims' });
  const selected = field.state === 'value' || field.state === 'source_null';
  if (selected !== (field.selected_claim_id !== null) || (field.selected_claim_id !== null && !field.claim_ids.includes(field.selected_claim_id))) {
    ctx.addIssue({ code: 'custom', message: 'Selected values require a listed selected claim; unresolved fields cannot select a value' });
  }
  if ((field.state === 'value') !== ((field as unknown as {value: unknown}).value !== null)) ctx.addIssue({ code: 'custom', message: 'Only a value field can contain a non-null value' });
  if (!selected && !field.reason) ctx.addIssue({ code: 'custom', message: 'Unknown field requires a reason' });
});
export type Field<T> = { state: typeof valueStates[number]; value: T | null; claim_ids: string[]; selected_claim_id: string | null; reason: string | null };
export const quantityUnits=['percent','percentage_points','stat_points','hp','gold','count','uses','tiles','skill_exp','class_exp','level','renown','support','turns','blaze_gauge','weight','unknown'] as const;
export const quantitySchema = z.object({
  raw: z.union([z.string(), z.number().finite()]).nullable(), state: z.enum(valueStates),
  number: z.number().finite().nullable(), lower: z.number().finite().nullable(), upper: z.number().finite().nullable(),
  unit: z.enum(quantityUnits).nullable(), qualifier: z.enum(['exact', 'range', 'uncertain', 'unlimited', 'unknown']),
}).strict().superRefine((q, ctx) => {
  if (q.qualifier === 'exact' && (q.state !== 'value' || q.number === null)) ctx.addIssue({ code: 'custom', message: 'Exact quantity needs a known number' });
  if (q.qualifier !== 'exact' && q.number !== null) ctx.addIssue({ code: 'custom', message: 'Uncertain/unlimited quantities are not exact numbers' });
  if (q.lower !== null && q.upper !== null && q.lower > q.upper) ctx.addIssue({ code: 'custom', message: 'Reversed quantity range' });
  if (q.qualifier === 'range' && q.lower === null && q.upper === null) ctx.addIssue({ code: 'custom', message: 'Range needs at least one bound' });
  if (q.state !== 'value' && (q.number !== null || q.lower !== null || q.upper !== null)) ctx.addIssue({ code: 'custom', message: 'Unknown quantity cannot invent numeric bounds' });
});
export type Quantity = z.infer<typeof quantitySchema>;
const parameterKeys = ['might','hit','crit','range','cost','hp_cost','blaze_required','blaze_cost','weight','uses','avoid','curse','price','activation','limit','limit_upgraded','durability','effect','damage_type'] as const;
export const parameterMapSchema = z.partialRecord(z.enum(parameterKeys), fieldSchema(z.union([quantitySchema, z.string()])));
const contextPayload = z.object({ source_label: z.string().optional(), role: z.string().optional(), route_ids: z.array(idSchema).optional(), part: z.number().int().positive().nullable().optional(), condition_ids: z.array(idSchema).optional(), profile_record_id:idSchema.optional() }).strict();
const conditionPayload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }).strict(),
  z.object({ kind: z.literal('skill_grade'), skill_id: idSchema, grade_id: idSchema }).strict(),
  z.object({ kind: z.literal('entity'), target_id: idSchema.nullable(), label: z.string(), target_kind: z.string() }).strict(),
  z.object({ kind: z.literal('quantity'), quantity: quantitySchema }).strict(),
  z.object({ kind: z.literal('support_threshold'), value: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('conversation_rank'), rank: z.string(), variant: z.string().nullable() }).strict(),
  z.object({ kind: z.literal('group') }).strict(),
]);
const factColumns: Record<string, readonly string[]> = {
  annotations: ['text'], character_identity: ['faction_text','epithet_text','gender_text','bloodmark_text'],
  class_profiles: ['movement_value','movement_types_json','examples_text'], stat_values: ['number_value','expression_text'],
  initial_skills: ['grade_id','affinity'], starting_states: ['level_value'], loadout_entries: ['quantity_value'],
  action_profiles: ['effect_text','damage_type','equipment_restriction_text','upgrade_text'], action_parameters: ['numeric_value'],
  class_skills: ['training_bonus','access_state'], class_certifications: ['listed_level','listed_renown','exclusivity_text','restriction_text'],
  class_rewards: ['exp_required'], recruitment_events: ['join_kind','chapter_value','renown_value','support_value','when_text'],
  activity_availability: ['availability_state'], time_assertions: ['start_month','start_day','end_month','end_day','time_text','deadline_turns','timing_text'],
  support_variants: ['condition_text','numeric_support_threshold'], support_directional_claims: ['text'],
  bird_prompts: ['prompt_text'], bird_responses: ['response_text'], preferences: ['tier'], crest_profiles: ['effect_text'],
  crest_associations: ['dragon_label','effect_text'], blaze_type_profiles: ['description_text'], blaze_associations: ['acquisition_text'],
  blessings: ['effect_text','day_text'], formulae: ['expression_text'],
  item_profiles: ['category_text','rarity_text','flavor_text','description_text','effect_text','use_text','rank_id','usage_scope'],
  recipes: ['cost_text'], acquisition_sources: ['source_summary','source_detail','probability_value'], container_contents: ['probability_value'],
  mount_profiles: ['food_category','taste_text','acquisition_text'], progression_steps: ['reward_text'],
  battalion_profiles: ['grade_id','category_text','limit_base','limit_upgraded'], location_profiles: ['description_text','discovery_text'],
  location_contexts: ['listed_state','display_name','description_text','recommended_level_text'], inventory_layers: ['note_text'],
};
export function isFactColumn(kind: RecordKind, column: string): boolean { return factColumns[kind]?.includes(column) ?? false; }
export function isField(value: unknown): value is Field<unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && 'state' in value && 'selected_claim_id' in value;
}
export function selectedValue(value: unknown): unknown { return isField(value) ? value.state === 'value' ? value.value : null : value; }
export function indexedValue(kind: RecordKind, column: string, value: unknown): unknown {
  const result = selectedValue(value);
  if (result === null && ['access_state','join_kind','availability_state','listed_state','usage_scope','tier'].includes(column)) return 'unknown';
  return result;
}
function jsonColumn(kind: RecordKind, column: string): z.ZodType {
  if (column.includes('quantity') || ['stock_json','price_json','cost_json','trigger_json'].includes(column)) return quantitySchema;
  if (column === 'parameters_json' || column === 'changes_json') return parameterMapSchema;
  if (column === 'movement_types_json') return z.array(z.enum(['infantry','cavalry','flying','armored']));
  if (column === 'source_context_json' || column === 'context_json') return contextPayload;
  if (kind === 'conditions' && column === 'value_json') return conditionPayload;
  if (column === 'variant_json') return z.object({ mode: z.enum(['neutral','boon','bane','normal','shadow','male','female','shared','unspecified']).optional(), label: z.string().optional(), level: z.number().int().nonnegative().optional() }).strict();
  if (column === 'geometry_json') return z.object({ kind: z.enum(['polygon','multipolygon','unknown']), coordinates: z.array(z.array(z.tuple([z.number().finite(), z.number().finite()]))).nullable() }).strict();
  if (column === 'transform_json') return z.object({ kind: z.literal('image_fraction'), axis_order: z.literal('yx'), units_x: z.number().positive(), units_y: z.number().positive(), flip_y: z.boolean() }).strict();
  if (kind === 'source_claims' && column === 'value_json') return z.json();
  throw new Error(`No structured JSON contract: ${kind}.${column}`);
}
const bodySchemas = new Map<RecordKind, z.ZodType>();
export function bodySchema(kind: RecordKind): z.ZodType {
  const cached = bodySchemas.get(kind); if (cached) return cached;
  const shape: Record<string, z.ZodType> = {};
  for (const column of TABLE_CONTRACTS[kind].columns) {
    if (column.name === 'record_id' && TABLE_CONTRACTS[kind].extension) continue;
    let schema: z.ZodType = column.name.endsWith('_json') ? jsonColumn(kind, column.name)
      : column.type === 'INTEGER' ? z.number().int().finite() : column.type === 'REAL' ? z.number().finite() : z.string();
    if(column.name==='unit') schema=z.enum(quantityUnits);
    if (isFactColumn(kind, column.name)) schema = fieldSchema(schema);
    else if (column.nullable) schema = schema.nullable();
    shape[column.name] = schema;
  }
  const result = z.object(shape).strict(); bodySchemas.set(kind, result); return result;
}
const recordKindSchema = z.enum(Object.keys(TABLE_CONTRACTS) as [RecordKind, ...RecordKind[]]);
export const canonicalRecordSchema = z.object({ id: idSchema, record_kind: recordKindSchema,
  entity_id: idSchema.nullable(), context_id: idSchema.nullable(), body: z.record(z.string(), z.unknown()),
}).strict().superRefine((record, ctx) => {
  const parsed = bodySchema(record.record_kind).safeParse(record.body);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', path: ['body', ...issue.path], message: issue.message });
});
export type CanonicalRecord = z.infer<typeof canonicalRecordSchema>;
export const documentFamilies = ['identity','context','evidence','characters','classes','paralogues','combat','social','items','mounts','world','assets'] as const;
export const canonicalDocumentSchema = z.object({ format_version: z.literal('2.0.0'), family: z.enum(documentFamilies),
  capture_ids: z.array(idSchema), records: z.array(canonicalRecordSchema),
}).strict();
export type CanonicalDocument = z.infer<typeof canonicalDocumentSchema>;
export const relativePathSchema = z.string().min(1).refine(p => !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.includes('\\') && p.split('/').every(s => s && s !== '.' && s !== '..'), 'Expected an application-relative path');
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const manifestV2Schema = z.object({ manifest_version: z.literal('2.0.0'), dataset_version: z.string().min(1), change_summary: z.string().min(1),
  reference_schema_version: z.literal(3), importer_version: z.literal('3.3.0'), release_status: z.enum(['candidate','reviewed']),
  documents: z.array(z.object({ family: z.enum(documentFamilies), path: relativePathSchema, format_version: z.literal('2.0.0'), sha256: digest }).strict()).min(1),
  identity_registry_sha256: digest,
  ui_associations:z.object({path:relativePathSchema,sha256:digest}).strict().optional(),
  runtime_assets:z.object({path:relativePathSchema,sha256:digest}).strict().optional(),
}).strict().superRefine((m, ctx) => {
  if (new Set(m.documents.map(d => d.path)).size !== m.documents.length) ctx.addIssue({ code: 'custom', message: 'Duplicate document path' });
  for (const family of ['identity','context','evidence']) if (!m.documents.some(d => d.family === family)) ctx.addIssue({ code: 'custom', message: `Missing ${family} document` });
  const registry = m.documents.filter(d => d.family === 'identity');
  if (registry.length !== 1 || registry[0].sha256 !== m.identity_registry_sha256) ctx.addIssue({ code: 'custom', message: 'Identity registry hash differs' });
});
export type ManifestV2 = z.infer<typeof manifestV2Schema>;
export const uiAssociationsSchema=z.object({coverage:z.literal('partial'),note:z.string(),entries:z.array(z.object({characterId:idSchema,abilityName:z.string(),skill:z.enum(SKILLS),evidence:z.string(),document_id:idSchema,source_pointer:z.string()}).strict())}).strict();
