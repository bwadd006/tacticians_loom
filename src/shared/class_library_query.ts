import { SKILLS, STATS, TIERS, type Skill, type Stat } from './catalog';
import type { CharacterClass, ClassUnlock } from './source_models';
import { classFilterIssue, classSortableFields, type ClassFilterRule, type ClassLibrarySetup } from './class_library_setup';

export function unlocksFor(characterClass: CharacterClass, unlocks: ClassUnlock[]): ClassUnlock[] {
  const ids = new Set(characterClass.unlock_ids);
  return unlocks.filter(unlock => ids.has(unlock.id));
}

function numericValue(characterClass: CharacterClass, field: string): number | null {
  return (STATS as readonly string[]).includes(field) ? characterClass.class_growth_rate_modifiers_percent[field as Stat] : null;
}

function matches(characterClass: CharacterClass, unlocks: ClassUnlock[], rule: ClassFilterRule): boolean {
  if (rule.kind === 'number') {
    const value = numericValue(characterClass, rule.field);
    if (value === null) return rule.unknown !== 'exclude';
    return rule.unknown !== 'only' && (rule.min === null || value >= rule.min) && (rule.max === null || value <= rule.max);
  }
  if (rule.kind === 'movement') return characterClass.movement_tags.includes(rule.tag);
  if (rule.kind === 'training') return (characterClass.skill_exp_bonuses[rule.skill as Skill] ?? Number.NEGATIVE_INFINITY) >= rule.min;
  if (rule.kind === 'certification') return characterClass.certification.recommended_skill_grades?.some(grade => grade.skill_id === rule.skill) ?? false;
  if (rule.kind === 'mastery') return `${characterClass.mastery.ability_name ?? ''} ${characterClass.mastery.effect ?? ''}`.toLocaleLowerCase('en').includes(rule.query.toLocaleLowerCase('en'));
  if (rule.kind === 'unlock_part') return unlocks.some(unlock => unlock.part === rule.part);
  if (rule.kind === 'data_state') {
    if (rule.state === 'unknown_growths') return STATS.some(stat => characterClass.class_growth_rate_modifiers_percent[stat] === null);
    if (rule.state === 'incomplete_certification') return !characterClass.certification.skill_rule_is_complete;
    if (rule.state === 'unverified_weapon_access') return !characterClass.weapon_access.verified;
    return characterClass.mastery.effect === null;
  }
  if (rule.match === 'has') return unlocks.length > 0;
  if (rule.match === 'none') return unlocks.length === 0;
  if (rule.match === 'route_specific') return unlocks.some(unlock => unlock.route_id !== null);
  if (rule.match === 'shared') return unlocks.some(unlock => unlock.route_id === null);
  return unlocks.some(unlock => unlock.missable === true);
}

function sortValue(characterClass: CharacterClass, unlocks: ClassUnlock[], field: string): number | string | null {
  if (field === 'name') return characterClass.name;
  if (field === 'movement') return characterClass.movement_tags.join(', ');
  if (field === 'certification') return characterClass.certification.recommended_skill_grades?.map(grade => `${grade.skill_id}:${grade.grade}`).join('|') ?? null;
  if (field === 'mastery') return characterClass.mastery.ability_name;
  if (field === 'unlock') {
    if (!unlocks.length) return null;
    const first = [...unlocks].sort((a, b) => (a.part ?? Number.MAX_SAFE_INTEGER) - (b.part ?? Number.MAX_SAFE_INTEGER) || (a.earliest_chapter ?? Number.MAX_SAFE_INTEGER) - (b.earliest_chapter ?? Number.MAX_SAFE_INTEGER) || a.activity_name.localeCompare(b.activity_name, 'en'))[0];
    return `${String(first.part ?? 999).padStart(3, '0')}:${String(first.earliest_chapter ?? 999).padStart(3, '0')}:${first.activity_name}`;
  }
  if (field.startsWith('training:')) return characterClass.skill_exp_bonuses[field.slice(9) as Skill] ?? null;
  return numericValue(characterClass, field);
}

export function queryClassLibrary(classes: CharacterClass[], unlocks: ClassUnlock[], setup: ClassLibrarySetup): CharacterClass[] {
  const knownTiers = setup.tiers.filter(tier => (TIERS as readonly string[]).includes(tier));
  const rules = setup.filters.filter(rule => classFilterIssue(rule) === null);
  const sorts = setup.sorts.filter(rule => classSortableFields().includes(rule.field));
  const search = setup.search.trim().toLocaleLowerCase('en');
  return classes.filter(characterClass => {
    if (!knownTiers.includes(characterClass.tier) || !characterClass.name.toLocaleLowerCase('en').includes(search)) return false;
    if (!rules.length) return true;
    const classUnlocks = unlocksFor(characterClass, unlocks);
    return setup.mode === 'all' ? rules.every(rule => matches(characterClass, classUnlocks, rule)) : rules.some(rule => matches(characterClass, classUnlocks, rule));
  }).sort((a, b) => {
    const aUnlocks = unlocksFor(a, unlocks), bUnlocks = unlocksFor(b, unlocks);
    for (const rule of sorts) {
      const x = sortValue(a, aUnlocks, rule.field), y = sortValue(b, bUnlocks, rule.field);
      if (x === null && y !== null) return 1;
      if (y === null && x !== null) return -1;
      if (x === null || y === null) continue;
      const result = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en');
      if (result) return rule.direction === 'asc' ? result : -result;
    }
    return a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id, 'en');
  });
}
