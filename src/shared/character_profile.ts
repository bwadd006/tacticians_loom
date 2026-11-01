import { z } from 'zod';
import type { Field } from './reference_v3';
import type { Stat } from './catalog';
import { referenceIdSchema, type DetailRecord, type EntitySummary, type ReferenceScope, type ActionSummary, type ProfileLink } from './reference_details';
export const PROFILE_SKILLS=['swords','spears','axes','bows','gauntlets','black_magic','white_magic','authority','infantry','heavy_armor','riding','flying'] as const;
export const PROFILE_TABS = [
  ['arts_abilities','Arts & Abilities'],['recruitment','Recruitment'],['liked_gifts','Liked Gifts'],['bird_time','Bird Time'],['supports','Supports'],
] as const;
export type ProfileTab = typeof PROFILE_TABS[number][0];
export const profilePreferenceSchema=z.object({characterId:referenceIdSchema}).strict();
export type ProfilePreference=z.infer<typeof profilePreferenceSchema>;
export interface CharacterProfile extends ReferenceScope {
  character:EntitySummary;
  identity:DetailRecord<'character_identity'>[];
  statProfiles:DetailRecord<'stat_profiles'>[];
  statValues:DetailRecord<'stat_values'>[];
  initialSkills:DetailRecord<'initial_skills'>[];
  startingStates:DetailRecord<'starting_states'>[];
  loadouts:DetailRecord<'loadout_entries'>[];
  recruitment:DetailRecord<'recruitment_events'>[];
  timing:DetailRecord<'time_assertions'>[];
  crests:DetailRecord<'crest_associations'>[];
  crestProfiles:DetailRecord<'crest_profiles'>[];
  blaze:DetailRecord<'blaze_associations'>[];
  blazeTypes:DetailRecord<'blaze_type_profiles'>[];
  actions:ActionSummary[];
  profiles:DetailRecord<'action_profiles'>[];
  profileLinks:ProfileLink[];
  relations:DetailRecord<'action_relations'>[];
  related:EntitySummary[];
  recordConditions:{recordId:string;conditionId:string;role:string}[];
  movement:{startingStateId:string;classId:string;value:Field<number>}[];
}
// Reserved for the separately scoped class-preview milestone. No live preview API.
export type ClassPreviewBoundary={kind:'deferred'}|{kind:'ready';selection:ClassPreviewSelection|null};
export interface ClassPreviewSelection {characterId:string;classId:string;contextId:string|null}
export interface PreviewGrowth {personal:number|null;classModifier:number|null;conditionalAdjustment:number|null;conditionState:'applicable'|'not_applicable'|'unresolved';combined:number|null}
export type PreviewGrowths=Record<Stat,PreviewGrowth>;
export const DEFERRED_CLASS_PREVIEW:ClassPreviewBoundary={kind:'deferred'};
