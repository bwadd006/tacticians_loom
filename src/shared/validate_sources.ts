import { AVAILABLE_STATUSES, ROUTES, SKILLS, STATS, TIERS } from './catalog';
import { charactersDocumentSchema, classesDocumentSchema, type CharactersDocument, type ClassesDocument } from './source_models';

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
export function validateSources(characterInput: unknown, classInput: unknown): { characters: CharactersDocument; classes: ClassesDocument } {
  const characters = charactersDocumentSchema.parse(characterInput);
  const classes = classesDocumentSchema.parse(classInput);
  for (const doc of [characters, classes]) {
    sameMembers(doc.metadata.stat_keys, STATS, 'stat keys');
    sameMembers(doc.metadata.proficiency_keys, SKILLS, 'skill keys');
  }
  sameMembers(characters.metadata.route_ids, ROUTES, 'route IDs');
  unique(characters.characters.map(c => c.id), 'character IDs');
  unique(classes.classes.map(c => c.id), 'class IDs');
  unique(classes.route_unlocks.map(u => u.id), 'unlock IDs');
  assert(characters.characters.length === characters.metadata.character_count, 'Character count mismatch');
  assert(classes.classes.length === classes.metadata.class_count, 'Class count mismatch');
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
  for (const c of characters.data_conflicts) if (c.character_id !== null) assert(characterIds.has(c.character_id), `Conflict references unknown character ${c.character_id}`);
  for (const c of classes.data_conflicts) if (c.class_id !== null) assert(classIds.has(c.class_id), `Conflict references unknown class ${c.class_id}`);
  return { characters, classes };
}
