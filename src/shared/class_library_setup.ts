import { z } from 'zod';
import { SKILLS, STATS, TIERS } from './catalog';
import { skillLabel, STAT_LABELS } from './library_setup';

const identifier = z.string().min(1).max(200);
const numberRule = z.object({
  kind: z.literal('number'), field: identifier,
  min: z.number().finite().nullable(), max: z.number().finite().nullable(),
  unknown: z.enum(['exclude', 'include', 'only']),
}).strict().refine(r => r.min === null || r.max === null || r.min <= r.max, 'Minimum must not exceed maximum');
export const classFilterSchema = z.discriminatedUnion('kind', [
  numberRule,
  z.object({ kind: z.literal('movement'), tag: identifier }).strict(),
  z.object({ kind: z.literal('training'), skill: identifier, min: z.number().finite() }).strict(),
  z.object({ kind: z.literal('certification'), skill: identifier }).strict(),
  z.object({ kind: z.literal('mastery'), query: z.string().min(1).max(200) }).strict(),
  z.object({ kind: z.literal('unlock'), match: z.enum(['has', 'none', 'route_specific', 'shared', 'missable']) }).strict(),
  z.object({ kind: z.literal('unlock_part'), part: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('data_state'), state: z.enum(['unknown_growths', 'incomplete_certification', 'unverified_weapon_access', 'unknown_mastery_effect']) }).strict(),
]);
export const classSetupSchema = z.object({
  version: z.literal(1), search: z.string().max(500),
  tiers: z.array(identifier).min(1).refine(values => new Set(values).size === values.length, 'Tiers must be distinct'),
  mode: z.enum(['all', 'any']), filters: z.array(classFilterSchema),
  sorts: z.array(z.object({ field: identifier, direction: z.enum(['asc', 'desc']) }).strict()),
}).strict().refine(s => new Set(s.sorts.map(r => r.field)).size === s.sorts.length, 'Sort fields must be distinct');

export type ClassLibrarySetup = z.infer<typeof classSetupSchema>;
export type ClassFilterRule = z.infer<typeof classFilterSchema>;
export type ClassSortRule = ClassLibrarySetup['sorts'][number];
export interface SavedClassSetup { setup: ClassLibrarySetup; savedAt: string; datasetVersion: string }

export const MOVEMENT_TAGS = ['infantry', 'cavalry', 'flying', 'armored'] as const;
export const CLASS_DATA_STATES = ['unknown_growths', 'incomplete_certification', 'unverified_weapon_access', 'unknown_mastery_effect'] as const;

export function defaultClassSetup(): ClassLibrarySetup {
  return { version: 1, search: '', tiers: [...TIERS], mode: 'all', filters: [], sorts: [{ field: 'name', direction: 'asc' }] };
}
export function applyClassColumnSort(setup: ClassLibrarySetup, field: string): ClassLibrarySetup {
  const existing = setup.sorts.findIndex(rule => rule.field === field);
  if (existing >= 0) return { ...setup, sorts: setup.sorts.map((rule, index) => index === existing ? { ...rule, direction: rule.direction === 'asc' ? 'desc' : 'asc' } : rule) };
  const direction = field === 'name' ? 'asc' : 'desc';
  const insertion = setup.sorts.at(-1)?.field === 'name' ? setup.sorts.length - 1 : setup.sorts.length;
  return { ...setup, sorts: [...setup.sorts.slice(0, insertion), { field, direction }, ...setup.sorts.slice(insertion)] };
}
export function classSortableFields(): string[] {
  return ['name', 'movement', ...STATS, ...SKILLS.map(skill => `training:${skill}`), 'certification', 'mastery', 'unlock'];
}
export function classFieldLabel(field: string): string {
  if (field in STAT_LABELS) return `${STAT_LABELS[field as keyof typeof STAT_LABELS]} modifier`;
  if (field.startsWith('training:')) return `${skillLabel(field.slice(9))} training`;
  return ({ name: 'Name', movement: 'Movement', certification: 'Certification grades', mastery: 'Mastery reward', unlock: 'Known unlock' } as Record<string, string>)[field] ?? field;
}
export function classFilterIssue(rule: ClassFilterRule): string | null {
  if (rule.kind === 'number' && !(STATS as readonly string[]).includes(rule.field)) return `Unavailable growth field: ${rule.field}`;
  if ((rule.kind === 'training' || rule.kind === 'certification') && !(SKILLS as readonly string[]).includes(rule.skill)) return `Unavailable skill: ${rule.skill}`;
  if (rule.kind === 'movement' && !(MOVEMENT_TAGS as readonly string[]).includes(rule.tag)) return `Unavailable movement tag: ${rule.tag}`;
  return null;
}
export function classSetupIssues(setup: ClassLibrarySetup): string[] {
  return [
    ...setup.tiers.filter(tier => !(TIERS as readonly string[]).includes(tier)).map(tier => `Unavailable tier: ${tier}`),
    ...setup.filters.map(classFilterIssue).filter((issue): issue is string => issue !== null),
    ...setup.sorts.filter(rule => !classSortableFields().includes(rule.field)).map(rule => `Unavailable sort: ${rule.field}`),
  ];
}
export function classFilterLabel(rule: ClassFilterRule): string {
  if (rule.kind === 'number') return `${classFieldLabel(rule.field)} ${rule.unknown === 'only' ? 'unknown only' : `${rule.min === null ? '' : `≥ ${rule.min}`} ${rule.max === null ? '' : `≤ ${rule.max}`} (${rule.unknown} unknowns)`}`;
  if (rule.kind === 'movement') return `Movement: ${skillLabel(rule.tag)}`;
  if (rule.kind === 'training') return `${skillLabel(rule.skill)} training ≥ ${rule.min > 0 ? '+' : ''}${rule.min}`;
  if (rule.kind === 'certification') return `Recommended grade: ${skillLabel(rule.skill)}`;
  if (rule.kind === 'mastery') return `Mastery contains “${rule.query}”`;
  if (rule.kind === 'unlock') return `Unlock: ${rule.match.replace('_', ' ')}`;
  if (rule.kind === 'unlock_part') return `Unlock part: ${rule.part}`;
  return `Data: ${rule.state.replaceAll('_', ' ')}`;
}
