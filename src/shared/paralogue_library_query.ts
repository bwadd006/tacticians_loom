import { ROUTES, type Route } from './catalog';
import type { GameDate, Paralogue, ParalogueAvailability } from './source_models';
import { parseParalogueRouteSortField, paralogueSortableFields, type ParalogueFilterRule, type ParalogueLibrarySetup } from './paralogue_library_setup';

export function gameDateValue(date: GameDate | null | undefined): number | null { return date ? date.month * 100 + date.day : null; }
export function formatGameDate(date: GameDate | null | undefined): string { return date ? `${date.month}/${date.day}` : 'Unknown'; }
export function formatAcceptanceWindow(window: ParalogueAvailability['acceptance_windows'][number]): string {
  if (!window.start && !window.end) return 'Unknown';
  if (window.start && window.end && gameDateValue(window.start) === gameDateValue(window.end)) return formatGameDate(window.start);
  return `${formatGameDate(window.start)}–${formatGameDate(window.end)}`;
}
function firstOpening(availability: ParalogueAvailability): number | null {
  const values = availability.acceptance_windows.map(window => gameDateValue(window.start)).filter((value): value is number => value !== null);
  return values.length ? Math.min(...values) : null;
}
function deadline(availability: ParalogueAvailability): number | null {
  return gameDateValue(availability.effective_completion_deadline ?? availability.listed_completion_deadline);
}
function routeCount(paralogue: Paralogue) { return ROUTES.filter(route => paralogue.route_availability[route].status === 'available').length; }
function statusValue(status: ParalogueAvailability['status']) { return ({ available: 0, unavailable: 1, unknown: 2 })[status]; }
function valueForSort(paralogue: Paralogue, field: string): string | number | null {
  if (field === 'name') return paralogue.name;
  if (field === 'associated_character') return paralogue.associated_character_name;
  if (field === 'route_count') return routeCount(paralogue);
  const parsed = parseParalogueRouteSortField(field);
  if (!parsed) return null;
  const availability = paralogue.route_availability[parsed.route];
  if (parsed.field === 'status') return statusValue(availability.status);
  if (availability.status !== 'available') return null;
  if (parsed.field === 'chapter') return availability.earliest_chapter;
  if (parsed.field === 'open') return firstOpening(availability);
  return deadline(availability);
}
function compareKnown(a: string | number, b: string | number) {
  return typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'en', { sensitivity: 'base' }) : Number(a) - Number(b);
}
function matchesUnknown(value: unknown, unknown: 'exclude' | 'include' | 'only', known: () => boolean) {
  const missing = value === null || value === undefined;
  if (unknown === 'only') return missing;
  if (missing) return unknown === 'include';
  return known();
}
function matchesFilter(paralogue: Paralogue, rule: ParalogueFilterRule, characterIds: ReadonlySet<string>): boolean | null {
  if (rule.kind === 'availability') return paralogue.route_availability[rule.route].status === rule.status;
  if (rule.kind === 'chapter') {
    const value = paralogue.route_availability[rule.route].earliest_chapter;
    return matchesUnknown(value, rule.unknown, () => (rule.min === null || value! >= rule.min) && (rule.max === null || value! <= rule.max));
  }
  if (rule.kind === 'date') {
    const availability = paralogue.route_availability[rule.route];
    const value = rule.field === 'open' ? firstOpening(availability) : deadline(availability), target = gameDateValue(rule.date)!;
    return matchesUnknown(value, rule.unknown, () => rule.comparison === 'on' ? value === target : rule.comparison === 'on_or_before' ? value! <= target : value! >= target);
  }
  if (rule.kind === 'timing') {
    const availabilities = ROUTES.map(route => paralogue.route_availability[route]);
    if (rule.state === 'missable') return availabilities.some(value => value.missable === true);
    if (rule.state === 'forced_start') return availabilities.some(value => value.forced_start_date !== null);
    if (rule.state === 'multiple_windows') return availabilities.some(value => value.acceptance_windows.length > 1);
    return paralogue.verification_status === 'conflicting' || paralogue.verification_status === 'unknown' || availabilities.some(value => value.verification_status === 'conflicting' || value.verification_status === 'unknown');
  }
  if (rule.kind === 'associated_character') return characterIds.has(rule.characterId)
    ? paralogue.associated_character_id === rule.characterId || paralogue.requirements.some(requirement => requirement.character_id === rule.characterId)
    : null;
  if (rule.kind === 'requirement') return paralogue.requirements.some(requirement => requirement.type === rule.type);
  return paralogue.outcomes.some(outcome => outcome.type === rule.type);
}
export function queryParalogueLibrary(paralogues: readonly Paralogue[], setup: ParalogueLibrarySetup, characterIds: ReadonlySet<string>): Paralogue[] {
  const query = setup.search.trim().toLocaleLowerCase('en');
  const validSorts = setup.sorts.filter(rule => paralogueSortableFields().includes(rule.field));
  return paralogues.filter(paralogue => {
    if (setup.route !== 'all' && paralogue.route_availability[setup.route].status !== 'available') return false;
    if (query) {
      const haystack = [paralogue.name, paralogue.associated_character_name, ...paralogue.requirements.map(value => value.text), ...paralogue.outcomes.flatMap(value => [value.name, value.text])].join(' ').toLocaleLowerCase('en');
      if (!haystack.includes(query)) return false;
    }
    const matches = setup.filters.map(rule => matchesFilter(paralogue, rule, characterIds)).filter((value): value is boolean => value !== null);
    return matches.length === 0 || (setup.mode === 'all' ? matches.every(Boolean) : matches.some(Boolean));
  }).sort((a, b) => {
    for (const rule of validSorts) {
      const av = valueForSort(a, rule.field), bv = valueForSort(b, rule.field);
      if (av === null && bv === null) continue;
      if (av === null) return 1;
      if (bv === null) return -1;
      const result = compareKnown(av, bv);
      if (result) return rule.direction === 'asc' ? result : -result;
    }
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  });
}
export function routeAvailabilityCount(paralogue: Paralogue) { return routeCount(paralogue); }
export function firstOpeningValue(paralogue: Paralogue, route: Route) { return firstOpening(paralogue.route_availability[route]); }
export function deadlineValue(paralogue: Paralogue, route: Route) { return deadline(paralogue.route_availability[route]); }
