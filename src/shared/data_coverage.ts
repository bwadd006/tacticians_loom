import { AVAILABLE_STATUSES, ROUTES } from './catalog';
import type { CharactersDocument, ClassesDocument } from './source_models';

export interface CoverageCount {
  known: number;
  total: number;
  percent: number;
}

const count = (known: number, total: number): CoverageCount => ({
  known,
  total,
  percent: total === 0 ? 100 : Math.round((known / total) * 1000) / 10,
});

const complete = (values: Record<string, number | null> | null) =>
  values !== null && Object.values(values).every(value => value !== null);

export function buildDataCoverageReport(characters: CharactersDocument, classes: ClassesDocument) {
  const characterRecords = characters.characters;
  const classRecords = classes.classes;
  const abilities = characterRecords.flatMap(character => character.personal_abilities);
  const classAbilities = classRecords.flatMap(characterClass => characterClass.active_class_abilities);
  const availableRecruitment = characterRecords.flatMap(character =>
    ROUTES.map(route => character.recruitment_by_route[route]),
  ).filter(record => (AVAILABLE_STATUSES as readonly string[]).includes(record.status));

  return {
    generated_from: {
      character_as_of_date: characters.metadata.as_of_date,
      class_as_of_date: classes.metadata.as_of_date,
    },
    characters: {
      records: characterRecords.length,
      starting_level: count(characterRecords.filter(character => character.starting_level !== null).length, characterRecords.length),
      starting_class: count(characterRecords.filter(character => character.starting_class !== null).length, characterRecords.length),
      base_stats: count(characterRecords.filter(character => complete(character.base_stats)).length, characterRecords.length),
      proficiency_lists: count(characterRecords.filter(character => character.skill_proficiencies.boons !== null && character.skill_proficiencies.banes !== null).length, characterRecords.length),
      verified_proficiencies: count(characterRecords.filter(character => character.skill_proficiencies.verified).length, characterRecords.length),
      personal_ability_effects: count(abilities.filter(ability => ability.effect !== null).length, abilities.length),
      personal_ability_levels: count(abilities.filter(ability => ability.acquisition.level !== null).length, abilities.length),
      available_recruitment_records: availableRecruitment.length,
      recruitment_source: count(availableRecruitment.filter(record => record.source !== null).length, availableRecruitment.length),
      recruitment_missability: count(availableRecruitment.filter(record => record.missable !== null).length, availableRecruitment.length),
    },
    classes: {
      records: classRecords.length,
      verified_weapon_access: count(classRecords.filter(characterClass => characterClass.weapon_access.verified).length, classRecords.length),
      documented_weapon_access_lists: count(classRecords.filter(characterClass => characterClass.weapon_access.usable_weapon_types !== null && characterClass.weapon_access.usable_magic_types !== null).length, classRecords.length),
      complete_growth_modifiers: count(classRecords.filter(characterClass => complete(characterClass.class_growth_rate_modifiers_percent)).length, classRecords.length),
      base_stat_modifiers: count(classRecords.filter(characterClass => complete(characterClass.base_stat_modifiers)).length, classRecords.length),
      active_ability_effects: count(classAbilities.filter(ability => ability.effect !== null).length, classAbilities.length),
      mastery_names: count(classRecords.filter(characterClass => characterClass.mastery.ability_name !== null).length, classRecords.length),
      mastery_effects: count(classRecords.filter(characterClass => characterClass.mastery.effect !== null).length, classRecords.length),
      mastery_exp_thresholds: count(classRecords.filter(characterClass => characterClass.mastery.class_exp_required !== null).length, classRecords.length),
      mastery_retention: count(classRecords.filter(characterClass => characterClass.mastery.retained_on_reclass !== null).length, classRecords.length),
      recommended_certification_grades: count(classRecords.filter(characterClass => characterClass.certification.recommended_skill_grades !== null).length, classRecords.length),
      complete_certification_logic: count(classRecords.filter(characterClass => characterClass.certification.skill_rule_is_complete).length, classRecords.length),
      exact_minimum_levels: count(classRecords.filter(characterClass => characterClass.certification.exact_minimum_level !== null).length, classRecords.length),
      exam_probability_formulas: count(classRecords.filter(characterClass => characterClass.certification.exam_pass_probability_formula !== null).length, classRecords.length),
      known_character_restrictions: count(classRecords.filter(characterClass => characterClass.known_character_restrictions !== null).length, classRecords.length),
      classes_with_specific_unlocks: count(classRecords.filter(characterClass => characterClass.unlock_ids.length > 0).length, classRecords.length),
    },
    unlocks: {
      records: classes.route_unlocks.length,
      earliest_chapter: count(classes.route_unlocks.filter(unlock => unlock.earliest_chapter !== null).length, classes.route_unlocks.length),
      missability: count(classes.route_unlocks.filter(unlock => unlock.missable !== null).length, classes.route_unlocks.length),
      cross_route_persistence: count(classes.route_unlocks.filter(unlock => unlock.persists_across_routes !== null).length, classes.route_unlocks.length),
    },
    provenance: {
      character_sources: characters.sources.length,
      class_sources: classes.sources.length,
      character_conflicts: characters.data_conflicts.length,
      class_conflicts: classes.data_conflicts.length,
    },
  };
}
