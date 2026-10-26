import { AVAILABLE_STATUSES, ROUTES, SKILLS, STATS, TIERS } from './catalog';
import { charactersDocumentSchema, classesDocumentSchema, paraloguesDocumentSchema, type CharactersDocument, type ClassesDocument, type ParaloguesDocument } from './source_models';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function unique(values: readonly string[], label: string) {
  assert(new Set(values).size === values.length, `Duplicate ${label}`);
}
function sameMembers(a: readonly string[], b: readonly string[], label: string) {
  unique(a, label);
  assert(a.length === b.length && a.every(x => b.includes(x)), `Inconsistent ${label}`);
}
export function validateSources(characterInput: unknown, classInput: unknown, paralogueInput: unknown): { characters: CharactersDocument; classes: ClassesDocument; paralogues: ParaloguesDocument } {
  const characters = charactersDocumentSchema.parse(characterInput);
  const classes = classesDocumentSchema.parse(classInput);
  const paralogues = paraloguesDocumentSchema.parse(paralogueInput);
  for (const doc of [characters, classes]) {
    sameMembers(doc.metadata.stat_keys, STATS, 'stat keys');
    sameMembers(doc.metadata.proficiency_keys, SKILLS, 'skill keys');
  }
  sameMembers(characters.metadata.route_ids, ROUTES, 'route IDs');
  sameMembers(paralogues.metadata.route_ids, ROUTES, 'paralogue route IDs');
  unique(characters.characters.map(c => c.id), 'character IDs');
  unique(classes.classes.map(c => c.id), 'class IDs');
  unique(classes.route_unlocks.map(u => u.id), 'unlock IDs');
  unique(paralogues.sources.map(source => source.key), 'paralogue source keys');
  unique(paralogues.paralogues.map(paralogue => paralogue.id), 'paralogue IDs');
  unique(paralogues.paralogues.map(paralogue => paralogue.name.toLocaleLowerCase('en')), 'paralogue names');
  assert(characters.characters.length === characters.metadata.character_count, 'Character count mismatch');
  assert(classes.classes.length === classes.metadata.class_count, 'Class count mismatch');
  assert(paralogues.paralogues.length === paralogues.metadata.paralogue_count, 'Paralogue count mismatch');
  const available = (status: string) => (AVAILABLE_STATUSES as readonly string[]).includes(status);
  for (const c of characters.characters) {
    const routes = ROUTES.filter(r => available(c.recruitment_by_route[r].status));
    sameMembers(routes, c.flags.available_part_1_routes, `${c.id} route flags`);
    assert(c.flags.recruitable_or_joins_in_part_1 === (routes.length > 0), `${c.id}: inconsistent Act 1 flag`);
    for (const list of [c.skill_proficiencies.boons, c.skill_proficiencies.banes]) {
      if (list !== null) unique(list, `${c.id} affinities`);
    }
    assert(!c.skill_proficiencies.boons?.some(s => c.skill_proficiencies.banes?.includes(s)), `${c.id}: contradictory affinity`);
    for (const a of c.personal_abilities) {
      if (a.upgrade_of) assert(c.personal_abilities.some(previous => previous.name === a.upgrade_of), `${c.id}: unknown ability upgrade`);
    }
  }
  for (const route of ROUTES) {
    assert(characters.characters.filter(c => available(c.recruitment_by_route[route].status)).length === characters.metadata.part_1_recruitment_records_by_route[route], `${route} recruitment count mismatch`);
  }
  const counts = characters.metadata;
  assert(characters.characters.filter(c => c.skill_proficiencies.boons !== null && c.skill_proficiencies.banes !== null).length === counts.characters_with_proficiencies, 'Proficiency count mismatch');
  assert(characters.characters.filter(c => Object.values(c.growth_rates_percent).every(v => v !== null)).length === counts.characters_with_growth_rates, 'Growth count mismatch');
  assert(characters.characters.filter(c => c.personal_abilities.length > 0).length === counts.characters_with_personal_abilities, 'Ability count mismatch');
  for (const tier of TIERS) assert(classes.classes.filter(c => c.tier === tier).length === classes.metadata.class_counts_by_tier[tier], `${tier} count mismatch`);
  const classIds = new Set(classes.classes.map(c => c.id));
  for (const c of characters.characters) if (c.starting_class !== null) assert(classIds.has(c.starting_class), `${c.id}: unknown starting class ID`);
  for (const c of classes.classes) {
    unique(c.unlock_ids, `${c.id} unlocks`);
    sameMembers(c.unlock_ids, classes.route_unlocks.filter(u => u.unlock_class_ids.includes(c.id)).map(u => u.id), `${c.id} unlock references`);
    if (c.certification.recommended_skill_grades) unique(c.certification.recommended_skill_grades.map(g => g.skill_id), `${c.id} grade skills`);
  }
  for (const u of classes.route_unlocks) {
    unique(u.unlock_class_ids, `${u.id} classes`);
    for (const id of u.unlock_class_ids) assert(classIds.has(id), `${u.id}: unknown class ${id}`);
  }
  const characterIds = new Set(characters.characters.map(c => c.id));
  const paralogueIds = new Set(paralogues.paralogues.map(paralogue => paralogue.id));
  for (const character of characters.characters) for (const route of ROUTES) {
    for (const requirement of character.recruitment_by_route[route].requirements) {
      if (requirement.type === 'paralogue') {
        assert(typeof requirement.paralogue_id === 'string', `${character.id}/${route}: paralogue recruitment requirement lacks a stable link`);
        assert(paralogueIds.has(requirement.paralogue_id), `${character.id}/${route}: unknown paralogue ${requirement.paralogue_id}`);
      }
    }
  }
  const sourceKeys = new Set(paralogues.sources.map(source => source.key));
  const dateValue = (date: { month: number; day: number }) => date.month * 100 + date.day;
  const verifySources = (keys: string[], label: string) => {
    for (const key of keys) assert(sourceKeys.has(key), `${label}: unknown source key ${key}`);
  };
  for (const paralogue of paralogues.paralogues) {
    if (paralogue.associated_character_id !== null) assert(characterIds.has(paralogue.associated_character_id), `${paralogue.id}: unknown associated character ${paralogue.associated_character_id}`);
    verifySources(paralogue.source_keys, paralogue.id);
    for (const route of ROUTES) {
      const availability = paralogue.route_availability[route];
      verifySources(availability.source_keys, `${paralogue.id}/${route}`);
      for (const window of availability.acceptance_windows) {
        if (window.start && window.end) assert(dateValue(window.start) <= dateValue(window.end), `${paralogue.id}/${route}: acceptance window starts after it ends`);
      }
      if (availability.status === 'unavailable') {
        assert(availability.acceptance_windows.length === 0, `${paralogue.id}/${route}: unavailable route has acceptance windows`);
        assert(availability.earliest_chapter === null && availability.listed_completion_deadline === null && availability.effective_completion_deadline === null && availability.forced_start_date === null, `${paralogue.id}/${route}: unavailable route has timing`);
      }
    }
    paralogue.requirements.forEach((requirement, index) => {
      if (requirement.character_id !== null) assert(characterIds.has(requirement.character_id), `${paralogue.id} requirement ${index}: unknown character ${requirement.character_id}`);
      if (requirement.paralogue_id !== null) assert(paralogueIds.has(requirement.paralogue_id), `${paralogue.id} requirement ${index}: unknown paralogue ${requirement.paralogue_id}`);
      for (const route of requirement.route_ids) assert(paralogue.route_availability[route].status !== 'unavailable', `${paralogue.id} requirement ${index}: unavailable route ${route}`);
      verifySources(requirement.source_keys, `${paralogue.id} requirement ${index}`);
    });
    paralogue.outcomes.forEach((outcome, index) => {
      if (outcome.character_id !== null) assert(characterIds.has(outcome.character_id), `${paralogue.id} outcome ${index}: unknown character ${outcome.character_id}`);
      if (outcome.class_id !== null) assert(classIds.has(outcome.class_id), `${paralogue.id} outcome ${index}: unknown class ${outcome.class_id}`);
      for (const route of outcome.route_ids) assert(paralogue.route_availability[route].status !== 'unavailable', `${paralogue.id} outcome ${index}: unavailable route ${route}`);
      verifySources(outcome.source_keys, `${paralogue.id} outcome ${index}`);
    });
  }
  for (const route of ROUTES) assert(paralogues.paralogues.filter(paralogue => paralogue.route_availability[route].status === 'available').length === paralogues.metadata.route_available_counts[route], `${route} paralogue count mismatch`);
  for (const conflict of paralogues.data_conflicts) {
    assert(paralogueIds.has(conflict.paralogue_id), `Conflict references unknown paralogue ${conflict.paralogue_id}`);
    verifySources(conflict.source_keys, `${conflict.paralogue_id} conflict`);
  }
  for (const c of characters.data_conflicts) if (c.character_id !== null) assert(characterIds.has(c.character_id), `Conflict references unknown character ${c.character_id}`);
  for (const c of classes.data_conflicts) if (c.class_id !== null) assert(classIds.has(c.class_id), `Conflict references unknown class ${c.class_id}`);
  return { characters, classes, paralogues };
}
