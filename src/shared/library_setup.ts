import { z } from 'zod';
import { ROUTES, ROUTE_NAMES, SKILLS, STATS, type Route, type RouteContext } from './catalog';

export const routeContextSchema = z.enum(['all', ...ROUTES]);
const identifier = z.string().min(1).max(200);
export const filterSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('number'), field: identifier, min: z.number().finite().nullable(), max: z.number().finite().nullable(), unknown: z.enum(['exclude', 'include', 'only']) }).strict()
    .refine(r => r.min === null || r.max === null || r.min <= r.max, 'Minimum must not exceed maximum'),
  z.object({ kind: z.literal('skill'), skill: identifier, match: z.enum(['boon', 'bane', 'neutral', 'not_bane', 'unknown', 'ability']) }).strict(),
]);
export const setupSchema = z.object({
  version: z.literal(1), search: z.string().max(500), mode: z.enum(['all', 'any']),
  filters: z.array(filterSchema),
  sorts: z.array(z.object({ field: identifier, direction: z.enum(['asc', 'desc']) }).strict()),
}).strict().refine(s => new Set(s.sorts.map(r => r.field)).size === s.sorts.length, 'Sort fields must be distinct');
export type LibrarySetup = z.infer<typeof setupSchema>;
export type FilterRule = z.infer<typeof filterSchema>;
export type SortRule = LibrarySetup['sorts'][number];
export interface SavedSetup { setup: LibrarySetup; savedAt: string; datasetVersion: string }
export function defaultSetup(): LibrarySetup { return { version: 1, search: '', mode: 'all', filters: [], sorts: [{ field: 'name', direction: 'asc' }] }; }
export function initialDrafts(): Record<RouteContext, LibrarySetup> { return Object.fromEntries(['all', ...ROUTES].map(r => [r, defaultSetup()])) as Record<RouteContext, LibrarySetup>; }
export const STAT_LABELS = { hp: 'HP', strength: 'Strength', magic: 'Magic', dexterity: 'Dexterity', speed: 'Speed', luck: 'Luck', defense: 'Defense', resistance: 'Resistance', charm: 'Charm' };
export const STAT_HEADERS = { hp: 'HP', strength: 'Str', magic: 'Mag', dexterity: 'Dex', speed: 'Spd', luck: 'Lck', defense: 'Def', resistance: 'Res', charm: 'Cha' };
export function skillLabel(id: string): string { return id.split('_').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' '); }
export const RECRUITMENT_FIELDS = ['earliest_chapter', 'min_renown', 'min_support'] as const;
export type RecruitmentField = typeof RECRUITMENT_FIELDS[number];
export function recruitmentSortField(route: Route, field: RecruitmentField): string { return `recruitment:${route}:${field}`; }
export function parseRecruitmentSortField(value: string): { route: Route; field: RecruitmentField } | null {
  const parts = value.split(':');
  if (parts.length !== 3 || parts[0] !== 'recruitment') return null;
  const route = parts[1], field = parts[2];
  if (!(ROUTES as readonly string[]).includes(route) || !(RECRUITMENT_FIELDS as readonly string[]).includes(field)) return null;
  return { route: route as Route, field: field as RecruitmentField };
}
export const RECRUITMENT_SORT_FIELDS = ROUTES.flatMap(route => RECRUITMENT_FIELDS.map(field => recruitmentSortField(route, field)));
export function numericFields(route: RouteContext): string[] { return [...STATS, ...(route === 'all' ? [] : RECRUITMENT_FIELDS)]; }
export function sortableFields(route: RouteContext): string[] { return ['name', ...STATS, ...(route === 'all' ? [] : ['status']), ...SKILLS.map(s => `affinity:${s}`), ...ROUTES.map(r => `availability:${r}`), ...RECRUITMENT_SORT_FIELDS]; }
export function fieldLabel(field: string): string {
  if (field in STAT_LABELS) return STAT_LABELS[field as keyof typeof STAT_LABELS];
  if (field.startsWith('affinity:')) return `${skillLabel(field.slice(9))} affinity`;
  if (field.startsWith('availability:')) return `${skillLabel(field.slice(13))} availability`;
  const recruitment = parseRecruitmentSortField(field);
  if (recruitment) return `${ROUTE_NAMES[recruitment.route]} — ${fieldLabel(recruitment.field)}`;
  return ({ name: 'Name', earliest_chapter: 'Chapter', min_renown: 'Renown', min_support: 'Support', status: 'Recruitment status' } as Record<string, string>)[field] ?? field;
}
export function normalizeLegacyRecruitmentSorts(setup: LibrarySetup, route: RouteContext): LibrarySetup {
  if (route === 'all') return setup;
  const seen = new Set<string>();
  const sorts = setup.sorts.map(rule => ({
    ...rule,
    field: (RECRUITMENT_FIELDS as readonly string[]).includes(rule.field) ? recruitmentSortField(route, rule.field as RecruitmentField) : rule.field,
  })).filter(rule => {
    if (seen.has(rule.field)) return false;
    seen.add(rule.field);
    return true;
  });
  return sorts.length === setup.sorts.length && sorts.every((rule, index) => rule.field === setup.sorts[index]?.field) ? setup : { ...setup, sorts };
}
export function applyColumnSort(setup: LibrarySetup, field: string, append = false): LibrarySetup {
  const existing = setup.sorts.findIndex(rule => rule.field === field);
  if (append) {
    if (existing >= 0) return { ...setup, sorts: setup.sorts.map((rule, index) => index === existing ? { ...rule, direction: rule.direction === 'asc' ? 'desc' : 'asc' } : rule) };
    const direction = field === 'name' || field.startsWith('availability:') || parseRecruitmentSortField(field) ? 'asc' : 'desc';
    const insertion = setup.sorts.at(-1)?.field === 'name' ? setup.sorts.length - 1 : setup.sorts.length;
    return { ...setup, sorts: [...setup.sorts.slice(0, insertion), { field, direction }, ...setup.sorts.slice(insertion)] };
  }
  const primary = setup.sorts[0];
  const direction = primary?.field === field ? primary.direction === 'asc' ? 'desc' : 'asc' : field === 'name' || field.startsWith('availability:') || parseRecruitmentSortField(field) ? 'asc' : 'desc';
  return { ...setup, sorts: [{ field, direction }, ...setup.sorts.filter(rule => rule.field !== field)] };
}
export function unresolvedFilter(rule: FilterRule, route: RouteContext): string | null {
  if (rule.kind === 'number' && !numericFields(route).includes(rule.field)) return `Unavailable field: ${rule.field}`;
  if (rule.kind === 'skill' && !(SKILLS as readonly string[]).includes(rule.skill)) return `Unavailable skill: ${rule.skill}`;
  return null;
}
export function setupIssues(setup: LibrarySetup, route: RouteContext): string[] {
  return [...setup.filters.map(r => unresolvedFilter(r, route)).filter((x): x is string => x !== null), ...setup.sorts.filter(r => !sortableFields(route).includes(r.field)).map(r => `Unavailable sort: ${r.field}`)];
}
