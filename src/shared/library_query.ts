import { AVAILABLE_STATUSES, ROUTES, SKILLS, STATS, type Route, type RouteContext, type Skill, type Stat } from './catalog';
import type { Character } from './source_models';
import { type FilterRule, type LibrarySetup, numericFields, parseRecruitmentSortField, sortableFields, unresolvedFilter } from './library_setup';
import associationData from '../../data/ability_associations.json';

export const ASSOCIATION_NOTE = associationData.note;
export function abilityMatches(character: Character, skill: string) {
  // Recheck the reviewed evidence against the active dataset; stale mappings cannot match.
  return associationData.entries.filter(entry => entry.characterId === character.id && entry.skill === skill && character.personal_abilities.some(a => a.name === entry.abilityName && a.effect === entry.evidence));
}
export function isAvailable(status: string): boolean { return (AVAILABLE_STATUSES as readonly string[]).includes(status); }
export function availabilityLabel(status: string): string {
  if (isAvailable(status)) return 'Available';
  if (status === 'not_available_in_part_1_recruitment_table') return 'Not listed';
  return status === 'unavailable' ? 'Unavailable' : 'Unknown';
}
export function statusLabel(status: string): string {
  return ({ recruitable: 'Recruitable', automatic: 'Automatic join', mandatory_tutorial: 'Tutorial join' } as Record<string, string>)[status] ?? availabilityLabel(status);
}
export function affinity(character: Character, skill: string): 'boon' | 'bane' | 'neutral' | 'unknown' {
  if (!(SKILLS as readonly string[]).includes(skill)) return 'unknown';
  const { boons, banes } = character.skill_proficiencies;
  if (boons?.includes(skill as Skill)) return 'boon';
  if (banes?.includes(skill as Skill)) return 'bane';
  return boons !== null && banes !== null ? 'neutral' : 'unknown';
}
function numericValue(character: Character, field: string, route: RouteContext): number | null {
  if ((STATS as readonly string[]).includes(field)) return character.growth_rates_percent[field as Stat];
  if (route !== 'all' && numericFields(route).includes(field)) return character.recruitment_by_route[route][field] as number | null;
  return null;
}
function matches(character: Character, rule: FilterRule, route: RouteContext): boolean {
  if (rule.kind === 'number') {
    const value = numericValue(character, rule.field, route);
    if (value === null) return rule.unknown !== 'exclude';
    return rule.unknown !== 'only' && (rule.min === null || value >= rule.min) && (rule.max === null || value <= rule.max);
  }
  if (rule.match === 'ability') return abilityMatches(character, rule.skill).length > 0;
  const result = affinity(character, rule.skill);
  return rule.match === 'not_bane' ? result === 'boon' || result === 'neutral' : result === rule.match;
}
function sortValue(character: Character, field: string, route: RouteContext): number | string | null {
  if (field === 'name') return character.name;
  if (field === 'status') return route === 'all' ? null : statusLabel(character.recruitment_by_route[route].status);
  const recruitment = parseRecruitmentSortField(field);
  if (recruitment) return character.recruitment_by_route[recruitment.route][recruitment.field];
  if (field.startsWith('affinity:')) return ({ boon: 0, neutral: 1, bane: 2, unknown: null })[affinity(character, field.slice(9))];
  if (field.startsWith('availability:')) {
    const status = character.recruitment_by_route[field.slice(13) as Route].status;
    return isAvailable(status) ? 0 : status === 'unavailable' ? 1 : null;
  }
  return numericValue(character, field, route);
}
export function queryLibrary(characters: Character[], route: RouteContext, setup: LibrarySetup): Character[] {
  const rules = setup.filters.filter(r => !unresolvedFilter(r, route));
  const sorts = setup.sorts.filter(r => sortableFields(route).includes(r.field));
  return characters.filter(c => {
    const scope = route === 'all' ? ROUTES.some(r => isAvailable(c.recruitment_by_route[r].status)) : isAvailable(c.recruitment_by_route[route].status);
    if (!scope || !c.name.toLocaleLowerCase('en').includes(setup.search.trim().toLocaleLowerCase('en'))) return false;
    if (!rules.length) return true;
    return setup.mode === 'all' ? rules.every(r => matches(c, r, route)) : rules.some(r => matches(c, r, route));
  }).sort((a, b) => {
    for (const rule of sorts) {
      const x = sortValue(a, rule.field, route), y = sortValue(b, rule.field, route);
      if (x === null && y !== null) return 1;
      if (y === null && x !== null) return -1;
      if (x === null || y === null) continue;
      const result = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en');
      if (result) return rule.direction === 'asc' ? result : -result;
    }
    return a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id, 'en');
  });
}
