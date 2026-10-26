import { z } from 'zod';
import { ROUTES, ROUTE_NAMES, type Route } from './catalog';
import { gameDateSchema, paralogueAvailabilityStatusSchema, paralogueOutcomeTypeSchema, paralogueRequirementTypeSchema } from './source_models';
import { routeContextSchema } from './library_setup';

const identifier = z.string().min(1).max(200);
const unknownHandling = z.enum(['exclude', 'include', 'only']);
export const PARALOGUE_REQUIREMENT_TYPES = ['required_recruited_character', 'required_participant', 'required_support', 'prerequisite_paralogue', 'prerequisite_quest', 'story_trigger', 'location_or_npc', 'other'] as const;
export const PARALOGUE_OUTCOME_TYPES = ['recruited_character', 'class_unlock', 'unique_equipment', 'battalion', 'ability', 'currency', 'renown', 'other'] as const;
export const PARALOGUE_TIMING_STATES = ['missable', 'forced_start', 'multiple_windows', 'uncertain'] as const;
export const PARALOGUE_ROUTE_SORTS = ['status', 'chapter', 'open', 'deadline'] as const;
export type ParalogueRouteSort = typeof PARALOGUE_ROUTE_SORTS[number];

export const paralogueFilterSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('availability'), route: z.enum(ROUTES), status: paralogueAvailabilityStatusSchema }).strict(),
  z.object({ kind: z.literal('chapter'), route: z.enum(ROUTES), min: z.number().int().nonnegative().nullable(), max: z.number().int().nonnegative().nullable(), unknown: unknownHandling }).strict()
    .refine(rule => rule.min === null || rule.max === null || rule.min <= rule.max, 'Minimum chapter must not exceed maximum chapter'),
  z.object({ kind: z.literal('date'), route: z.enum(ROUTES), field: z.enum(['open', 'deadline']), comparison: z.enum(['on', 'on_or_before', 'on_or_after']), date: gameDateSchema, unknown: unknownHandling }).strict(),
  z.object({ kind: z.literal('timing'), state: z.enum(PARALOGUE_TIMING_STATES) }).strict(),
  z.object({ kind: z.literal('associated_character'), characterId: identifier }).strict(),
  z.object({ kind: z.literal('requirement'), type: paralogueRequirementTypeSchema }).strict(),
  z.object({ kind: z.literal('outcome'), type: paralogueOutcomeTypeSchema }).strict(),
]);

export const paralogueSetupSchema = z.object({
  version: z.literal(1), search: z.string().max(500), route: routeContextSchema,
  mode: z.enum(['all', 'any']), filters: z.array(paralogueFilterSchema),
  sorts: z.array(z.object({ field: identifier, direction: z.enum(['asc', 'desc']) }).strict()),
}).strict().refine(setup => new Set(setup.sorts.map(rule => rule.field)).size === setup.sorts.length, 'Sort fields must be distinct');

export type ParalogueLibrarySetup = z.infer<typeof paralogueSetupSchema>;
export type ParalogueFilterRule = z.infer<typeof paralogueFilterSchema>;
export type ParalogueSortRule = ParalogueLibrarySetup['sorts'][number];
export interface SavedParalogueSetup { setup: ParalogueLibrarySetup; savedAt: string; datasetVersion: string }

export function defaultParalogueSetup(): ParalogueLibrarySetup {
  return { version: 1, search: '', route: 'all', mode: 'all', filters: [], sorts: [{ field: 'name', direction: 'asc' }] };
}
export function paralogueRouteSortField(route: Route, field: ParalogueRouteSort) { return `${route}:${field}`; }
export function parseParalogueRouteSortField(field: string): { route: Route; field: ParalogueRouteSort } | null {
  const [route, value, extra] = field.split(':');
  return !extra && (ROUTES as readonly string[]).includes(route) && (PARALOGUE_ROUTE_SORTS as readonly string[]).includes(value)
    ? { route: route as Route, field: value as ParalogueRouteSort } : null;
}
export function paralogueSortableFields(): string[] {
  return ['name', 'associated_character', 'route_count', ...ROUTES.flatMap(route => PARALOGUE_ROUTE_SORTS.map(field => paralogueRouteSortField(route, field)))];
}
export function paralogueFieldLabel(field: string): string {
  const routeField = parseParalogueRouteSortField(field);
  if (routeField) return `${ROUTE_NAMES[routeField.route]} — ${{ status: 'Availability', chapter: 'Chapter', open: 'Opening date', deadline: 'Deadline' }[routeField.field]}`;
  return ({ name: 'Name', associated_character: 'Associated character', route_count: 'Available routes' } as Record<string, string>)[field] ?? field;
}
export function applyParalogueColumnSort(setup: ParalogueLibrarySetup, field: string): ParalogueLibrarySetup {
  const existing = setup.sorts.findIndex(rule => rule.field === field);
  if (existing >= 0) return { ...setup, sorts: setup.sorts.map((rule, index) => index === existing ? { ...rule, direction: rule.direction === 'asc' ? 'desc' : 'asc' } : rule) };
  const direction = ['name', 'associated_character', ...ROUTES.flatMap(route => [paralogueRouteSortField(route, 'chapter'), paralogueRouteSortField(route, 'open'), paralogueRouteSortField(route, 'deadline')])].includes(field) ? 'asc' : 'desc';
  const insertion = setup.sorts.at(-1)?.field === 'name' ? setup.sorts.length - 1 : setup.sorts.length;
  return { ...setup, sorts: [...setup.sorts.slice(0, insertion), { field, direction }, ...setup.sorts.slice(insertion)] };
}
export function paralogueSetupIssues(setup: ParalogueLibrarySetup, characterIds: ReadonlySet<string>): string[] {
  const issues: string[] = [];
  for (const rule of setup.filters) {
    if ('route' in rule && !(ROUTES as readonly string[]).includes(rule.route)) issues.push(`Unavailable route: ${rule.route}`);
    if (rule.kind === 'associated_character' && !characterIds.has(rule.characterId)) issues.push(`Unavailable character: ${rule.characterId}`);
  }
  for (const rule of setup.sorts) if (!paralogueSortableFields().includes(rule.field)) issues.push(`Unavailable sort: ${rule.field}`);
  return issues;
}
