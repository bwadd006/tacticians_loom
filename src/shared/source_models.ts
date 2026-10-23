import { z } from 'zod';
import { ROUTES, SKILLS, STATS, TIERS } from './catalog';

const id = z.string().min(1);
const numberOrNull = z.number().finite().nullable();
const threshold = z.number().int().nonnegative().nullable();
const skill = z.enum(SKILLS);
const skillList = z.array(skill).nullable();
const object = z.record(z.string(), z.unknown());
const stats = z.record(z.enum(STATS), numberOrNull);
const metadata = z.object({
  schema_version: z.literal('1.0.0'), as_of_date: z.string(),
  stat_keys: z.array(z.enum(STATS)), proficiency_keys: z.array(skill),
}).passthrough();
const source = z.object({ name: z.string(), url: z.string().url() }).passthrough();
const conflict = z.object({ field: z.string(), status: z.string() }).passthrough();
export const recruitmentSchema = z.object({
  status: z.enum(['recruitable', 'automatic', 'mandatory_tutorial', 'not_available_in_part_1_recruitment_table', 'unavailable', 'unknown']),
  earliest_chapter: threshold, min_renown: threshold, min_support: threshold,
  requirements: z.array(z.object({ type: z.string() }).passthrough()),
  missable: z.boolean().nullable(), source: z.string().nullable(),
}).passthrough();
export const characterSchema = z.object({
  id, name: z.string().min(1), availability_category: z.string(),
  growth_rates_percent: stats, growth_rates_source: z.string(),
  effective_personal_growth_rates_percent: stats.nullable(),
  effective_growth_rates_note: z.string().nullable(),
  starting_level: threshold, starting_class: z.string().nullable(),
  base_stats: stats.nullable(), base_stats_note: z.string(),
  skill_proficiencies: z.object({ boons: skillList, banes: skillList, verified: z.boolean(), source: z.string().nullable() }).passthrough(),
  personal_abilities: z.array(z.object({
    name: z.string(), effect: z.string().nullable(),
    acquisition: z.object({ type: z.string(), level: threshold }).passthrough(),
    source: z.string(), rank: z.number().int().positive(), upgrade_of: z.string().optional(),
  }).passthrough()),
  recruitment_by_route: z.record(z.enum(ROUTES), recruitmentSchema),
  flags: z.object({ recruitable_or_joins_in_part_1: z.boolean(), available_part_1_routes: z.array(z.enum(ROUTES)) }).passthrough(),
  notes: z.array(z.string()),
}).passthrough();
export const classSchema = z.object({
  id, name: z.string().min(1), tier: z.enum(TIERS), playable: z.boolean(),
  movement_tags: z.array(z.string()),
  skill_exp_bonuses: z.partialRecord(skill, z.number().finite()),
  skills_listed_without_exp_bonus: z.array(z.union([skill, z.literal('any_weapon')])),
  weapon_access: z.object({
    usable_weapon_types: skillList, usable_magic_types: skillList, verified: z.boolean(), note: z.string(),
  }).passthrough(),
  class_growth_rate_modifiers_percent: stats,
  base_stat_modifiers: stats.nullable(),
  active_class_abilities: z.array(z.object({ name: z.string(), effect: z.string().nullable(), source: z.string() }).passthrough()),
  mastery: z.object({ ability_name: z.string().nullable(), effect: z.string().nullable(), class_exp_required: threshold, retained_on_reclass: z.boolean().nullable() }).passthrough(),
  certification: z.object({
    tier_rule_id: z.enum(TIERS),
    recommended_skill_grades: z.array(z.object({ skill_id: skill, grade: z.string() }).passthrough()).nullable(),
    skill_rule_is_complete: z.boolean(), logic: z.string().nullable(), grade_source: z.string().nullable(),
    exam_pass_probability_formula: z.string().nullable(), exact_minimum_level: threshold,
    character_exceptions: z.array(object).nullable(),
  }).passthrough(),
  known_character_restrictions: z.array(object).nullable(),
  unlock_ids: z.array(id), source_urls: z.array(z.string()),
}).passthrough();
export const charactersDocumentSchema = z.object({
  metadata: metadata.extend({
    route_ids: z.array(z.enum(ROUTES)), character_count: z.number().int(),
    characters_with_proficiencies: z.number().int(), characters_with_growth_rates: z.number().int(),
    characters_with_personal_abilities: z.number().int(),
    part_1_recruitment_records_by_route: z.record(z.enum(ROUTES), z.number().int()),
  }),
  sources: z.array(source), data_conflicts: z.array(conflict.extend({ character_id: id.nullable() })),
  characters: z.array(characterSchema).min(1),
}).passthrough();
export const classesDocumentSchema = z.object({
  metadata: metadata.extend({ class_count: z.number().int(), class_counts_by_tier: z.record(z.enum(TIERS), z.number().int()) }),
  sources: z.array(source), data_conflicts: z.array(conflict.extend({ class_id: id.nullable() })),
  certification_rules: z.record(z.enum(TIERS), z.object({
    license: z.string().nullable(), ideal_character_level: threshold, minimum_renown_level: threshold, requires_exam: z.boolean().nullable(),
    additional_unlock_item: z.string().optional(),
  }).passthrough()),
  route_unlocks: z.array(z.object({
    id, route_id: z.enum(ROUTES).nullable(), unlock_class_ids: z.array(id),
    part: threshold, earliest_chapter: threshold, activity_name: z.string(), requirements: object,
    deadline_in_game: z.string().nullable(), missable: z.boolean().nullable(),
    persists_across_routes: z.boolean().nullable(), status: z.string(), source_url: z.string(),
  }).passthrough()),
  character_restrictions: z.object({ global_character_class_restrictions_verified: z.boolean(), exceptions: z.array(object), note: z.string() }).passthrough(),
  classes: z.array(classSchema).min(1),
}).passthrough();
export const datasetManifestSchema = z.object({
  dataset_version: z.string().min(1), change_summary: z.string().min(1),
  source_files: z.object({ characters: z.literal('fire_emblem_fortunes_weave_characters.json'), classes: z.literal('fire_emblem_fortunes_weave_classes.json') }),
});
export type Character = z.infer<typeof characterSchema>;
export type CharacterClass = z.infer<typeof classSchema>;
export type CharactersDocument = z.infer<typeof charactersDocumentSchema>;
export type ClassesDocument = z.infer<typeof classesDocumentSchema>;
export type CertificationRules = ClassesDocument['certification_rules'];
export type ClassUnlock = ClassesDocument['route_unlocks'][number];
