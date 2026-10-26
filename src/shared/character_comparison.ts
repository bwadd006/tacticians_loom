import { ROUTES, SKILLS, STATS, type Route, type Skill, type Stat } from './catalog';
import type { Character } from './source_models';
import type { CharacterPlanning } from './character_planning';
import { affinity, isAvailable } from './library_query';
import { fieldLabel, parseRecruitmentSortField, recruitmentSortField, skillLabel, type SortRule } from './library_setup';

export interface ShortlistEntry { character: Character | null; planning: CharacterPlanning }
export const SHORTLIST_SORT_FIELDS = [
  'name', ...STATS, ...SKILLS.map(skill => `affinity:${skill}`),
  ...ROUTES.map(route => `availability:${route}`),
  ...ROUTES.flatMap(route => ['earliest_chapter', 'min_renown', 'min_support'].map(field => recruitmentSortField(route, field as 'earliest_chapter' | 'min_renown' | 'min_support'))),
  'shortlisted_at',
];

export function shortlistFieldLabel(field: string): string {
  return field === 'shortlisted_at' ? 'Date added' : fieldLabel(field);
}

export function defaultShortlistSorts(): SortRule[] { return [{ field: 'name', direction: 'asc' }]; }
export function shortlistDefaultDirection(field: string): 'asc' | 'desc' {
  if (field === 'shortlisted_at') return 'desc';
  return field === 'name' || field.startsWith('availability:') || field.startsWith('affinity:') || Boolean(parseRecruitmentSortField(field)) ? 'asc' : 'desc';
}

export function applyShortlistColumnSort(sorts: SortRule[], field: string): SortRule[] {
  const existing = sorts.findIndex(rule => rule.field === field);
  if (existing >= 0) return sorts.map((rule, index) => index === existing ? { ...rule, direction: rule.direction === 'asc' ? 'desc' : 'asc' } : rule);
  const direction = shortlistDefaultDirection(field);
  const insertion = sorts.at(-1)?.field === 'name' ? sorts.length - 1 : sorts.length;
  return [...sorts.slice(0, insertion), { field, direction }, ...sorts.slice(insertion)];
}

function shortlistValue(entry: ShortlistEntry, field: string): number | string | null {
  const character = entry.character;
  if (field === 'shortlisted_at') return entry.planning.shortlistedAt;
  if (!character) return field === 'name' ? entry.planning.characterId : null;
  if (field === 'name') return character.name;
  if ((STATS as readonly string[]).includes(field)) return character.growth_rates_percent[field as Stat];
  if (field.startsWith('affinity:')) return ({ boon: 0, neutral: 1, bane: 2, unknown: null })[affinity(character, field.slice(9))];
  if (field.startsWith('availability:')) {
    const status = character.recruitment_by_route[field.slice(13) as Route].status;
    return isAvailable(status) ? 0 : status === 'unavailable' ? 1 : null;
  }
  const recruitment = parseRecruitmentSortField(field);
  return recruitment ? character.recruitment_by_route[recruitment.route][recruitment.field] : null;
}

export function sortShortlist(entries: ShortlistEntry[], sorts: SortRule[]): ShortlistEntry[] {
  const validSorts = sorts.filter(rule => SHORTLIST_SORT_FIELDS.includes(rule.field));
  return [...entries].sort((a, b) => {
    for (const rule of validSorts) {
      const x = shortlistValue(a, rule.field), y = shortlistValue(b, rule.field);
      if (x === null && y !== null) return 1;
      if (y === null && x !== null) return -1;
      if (x === null || y === null) continue;
      const result = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en');
      if (result) return rule.direction === 'asc' ? result : -result;
    }
    const aName = a.character?.name ?? a.planning.characterId;
    const bName = b.character?.name ?? b.planning.characterId;
    return aName.localeCompare(bName, 'en') || a.planning.characterId.localeCompare(b.planning.characterId, 'en');
  });
}

export function comparisonValuesDiffer(values: unknown[]): boolean {
  if (values.length < 2) return false;
  return new Set(values.map(value => value === null || value === undefined ? '__unknown__' : JSON.stringify(value))).size > 1;
}

export function affinityDisplay(character: Character, skill: Skill): string {
  return skillLabel(affinity(character, skill));
}
