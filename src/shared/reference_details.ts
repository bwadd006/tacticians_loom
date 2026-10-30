import { z } from 'zod';
import { fieldSchema, quantitySchema, parameterMapSchema } from './reference_v3';
import { ROUTES } from './catalog';

export const referenceIdSchema=z.string().min(1).max(200).refine(s=>!s.includes('\0'),'Invalid reference ID');
const id=referenceIdSchema,nullableId=id.nullable(),str=z.string(),integer=z.number().int(),num=z.number().finite();
const textFact=fieldSchema(str),numberFact=fieldSchema(num),integerFact=fieldSchema(integer);
const record=<K extends string,S extends z.ZodRawShape>(kind:K,shape:S)=>z.object({id,record_kind:z.literal(kind),entity_id:nullableId,context_id:nullableId,body:z.object(shape).strict()}).strict();
// Purpose-specific read contracts preserve source value states and references.
// Neither a raw SQL query nor an arbitrary record-kind request crosses preload.
export const detailRecordSchemas={
 learning_rules:record('learning_rules',{scope:str,source_roster_capture_id:nullableId,skill_id:nullableId,rule_completeness:str}),
 learning_awards:record('learning_awards',{rule_id:nullableId,character_id:nullableId,acquired_entity_id:nullableId,acquired_label:str,skill_id:nullableId,grade_id:nullableId,acquisition_kind:str,level_value:integer.nullable(),active_at_start:integer.nullable(),condition_id:nullableId,applicability:str}),
 action_profiles:record('action_profiles',{action_id:id,effect_text:textFact,damage_type:textFact,equipment_restriction_text:textFact,upgrade_text:textFact,parameters_json:parameterMapSchema}),
 action_parameters:record('action_parameters',{action_id:id,parameter_key:str,quantity_json:quantitySchema,numeric_value:numberFact,unit:str.nullable(),variant_id:nullableId}),
 class_rewards:record('class_rewards',{class_id:id,action_id:nullableId,label:str,reward_kind:str,exp_required:integerFact,retention_state:str}),
 item_action_links:record('item_action_links',{item_id:id,action_id:nullableId,action_label:str,link_kind:str,resolution:str}),
 item_profiles:record('item_profiles',{item_id:id,category_text:textFact,rarity_text:textFact,flavor_text:textFact,description_text:textFact,effect_text:textFact,use_text:textFact,rank_id:textFact,usage_scope:textFact,parameters_json:parameterMapSchema}),
 item_requirements:record('item_requirements',{item_id:id,skill_id:nullableId,grade_id:nullableId,condition_id:nullableId,semantics_state:str}),
 item_variants:record('item_variants',{item_id:id,base_item_id:id,refinement_level:integer.nullable(),changes_json:parameterMapSchema}),
 recipes:record('recipes',{output_id:nullableId,recipe_kind:str,output_label:str,output_quantity_json:quantitySchema,cost_text:textFact,condition_id:nullableId}),
 recipe_inputs:record('recipe_inputs',{recipe_id:id,target_id:nullableId,label:str,quantity_json:quantitySchema,condition_id:nullableId,source_order:integer.nullable()}),
 acquisition_sources:record('acquisition_sources',{target_id:nullableId,label:str,acquisition_kind:str,location_id:nullableId,activity_id:nullableId,source_summary:textFact,source_detail:textFact,condition_id:nullableId,probability_value:numberFact,probability_state:str}),
 container_contents:record('container_contents',{container_id:id,target_id:nullableId,label:str,quantity_json:quantitySchema,probability_value:numberFact,probability_state:str,source_order:integer.nullable()}),
 bird_prompts:record('bird_prompts',{character_id:id,prompt_text:textFact,source_order:integer.nullable()}),
 preferences:record('preferences',{character_id:id,subject_id:nullableId,subject_label:str,subject_kind:str,tier:textFact,resolution:str,source_order:integer.nullable()}),
 support_variants:record('support_variants',{pair_id:id,conversation_rank:str,variant_label:str.nullable(),condition_id:nullableId,condition_text:textFact,numeric_support_threshold:integerFact}),
 support_directional_claims:record('support_directional_claims',{pair_id:id,from_person_id:id,to_person_id:id,conversation_rank:str,text:textFact,variant_id:nullableId,reconciliation_state:str}),
 location_profiles:record('location_profiles',{location_id:id,description_text:textFact,discovery_text:textFact}),
 location_contexts:record('location_contexts',{location_id:id,listed_state:textFact,display_name:textFact,description_text:textFact,recommended_level_text:textFact}),
 location_contents:record('location_contents',{location_context_id:nullableId,location_id:id,target_id:nullableId,label:str,content_role:str,quantity_json:quantitySchema,condition_id:nullableId,source_order:integer.nullable()}),
 inventory_layers:record('inventory_layers',{shop_id:id,parent_layer_id:nullableId,collection_state:str,inheritance_mode:str,note_text:textFact}),
 shop_offers:record('shop_offers',{layer_id:id,target_id:nullableId,label:str,stock_json:quantitySchema,price_json:quantitySchema,condition_id:nullableId,source_order:integer.nullable()}),
 map_markers:record('map_markers',{surface_id:id,location_id:nullableId,source_y:num.nullable(),source_x:num.nullable(),position_state:str}),
 map_tiles:record('map_tiles',{surface_id:id,level:integer,tile_x:integer,tile_y:integer,asset_id:nullableId}),
 map_geometries:record('map_geometries',{surface_id:id,region_id:nullableId,geometry_kind:str,geometry_state:str,geometry_json:z.object({kind:z.enum(['polygon','multipolygon','unknown']),coordinates:z.array(z.array(z.tuple([num,num]))).nullable()}).strict()}),
};
export type DetailKind=keyof typeof detailRecordSchemas;
export type DetailRecord<K extends DetailKind>=z.infer<typeof detailRecordSchemas[K]>;
export type EntitySummary={id:string;kind:string;name:string;identityState:string;retired:boolean};
export const actionKindSchema=z.enum(['ability','combat_art','spell','blaze_art','blaze_ability','gambit']);
export type ActionSummary=EntitySummary&{actionKind:z.infer<typeof actionKindSchema>;skillId:string|null;profileRecordId:string};
export const catalogRequestSchema=z.object({kind:z.enum(['character','class','action','item','mount','battalion','crest','blaze_type','location','region','map_surface']),search:z.string().max(200).default(''),actionKind:actionKindSchema.optional(),limit:integer.min(1).max(100).default(50),offset:integer.min(0).max(100000).default(0)}).strict().superRefine((r,c)=>{if(r.actionKind&&r.kind!=='action')c.addIssue({code:'custom',message:'Action-kind filters require the action catalog'});});
export type CatalogRequest=z.input<typeof catalogRequestSchema>;
export interface ReferencePage<T>{rows:T[];total:number;offset:number;limit:number;nextOffset:number|null}
export const locationRequestSchema=z.object({locationId:id,contextId:id.optional()}).strict();
export type LocationRequest=z.infer<typeof locationRequestSchema>;
export const markerRequestSchema=z.object({markerId:id,contextId:id}).strict();
export type MarkerRequest=z.infer<typeof markerRequestSchema>;
export const markerListRequestSchema=z.object({surfaceId:id,contextId:id.optional(),limit:integer.min(1).max(100).default(50),offset:integer.min(0).max(100000).default(0)}).strict();
export type MarkerListRequest=z.input<typeof markerListRequestSchema>;
export const evidenceRequestSchema=z.array(id).min(1).max(100);
export const contextSchema=z.object({id,label:str,route_scope:z.enum(['listed','all','unknown','not_applicable']),part:integer.nullable(),part_state:z.enum(['specified','unknown','not_applicable']),chapter_low:integer.nullable(),chapter_high:integer.nullable(),section_text:str.nullable(),difficulty_text:str.nullable(),condition_root_id:nullableId,route_ids:z.array(z.enum(ROUTES))}).strict();
const conditionValueSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('text'),text:str}).strict(),z.object({kind:z.literal('skill_grade'),skill_id:id,grade_id:id}).strict(),
 z.object({kind:z.literal('entity'),target_id:nullableId,label:str,target_kind:str}).strict(),z.object({kind:z.literal('quantity'),quantity:quantitySchema}).strict(),
 z.object({kind:z.literal('support_threshold'),value:integer.nonnegative()}).strict(),z.object({kind:z.literal('conversation_rank'),rank:str,variant:str.nullable()}).strict(),z.object({kind:z.literal('group')}).strict(),
]);
export const conditionSchema=z.object({id,node_kind:z.enum(['all','any','not','leaf','unspecified']),predicate:str.nullable(),subject_id:nullableId,object_id:nullableId,value:conditionValueSchema,claim_id:nullableId,children:z.array(z.object({id,order:integer}).strict())}).strict();
export interface ReferenceScope{contexts:z.infer<typeof contextSchema>[];conditions:z.infer<typeof conditionSchema>[]}
export interface ProfileLink{ownerRecordId:string;profileRecordId:string}
export interface CharacterLearning extends ReferenceScope{character:EntitySummary;awards:DetailRecord<'learning_awards'>[];rules:DetailRecord<'learning_rules'>[];actions:ActionSummary[];profiles:DetailRecord<'action_profiles'>[];profileLinks:ProfileLink[]}
export interface ClassRewards extends ReferenceScope{characterClass:EntitySummary;rewards:DetailRecord<'class_rewards'>[];actions:ActionSummary[];profiles:DetailRecord<'action_profiles'>[];profileLinks:ProfileLink[]}
export interface ActionReference extends ReferenceScope{action:ActionSummary;profiles:DetailRecord<'action_profiles'>[];parameters:DetailRecord<'action_parameters'>[];itemLinks:DetailRecord<'item_action_links'>[];items:EntitySummary[]}
export interface SourceCoverage{field:string;captureState:string;semanticState:string;canonicalState:string;importState:string;reason:string|null}
export interface CharacterSocial extends ReferenceScope{character:EntitySummary;coverage:SourceCoverage[];birdTime:{prompt:DetailRecord<'bird_prompts'>;answers:{id:string;responseId:string;text:z.infer<typeof textFact>}[]}[];preferences:DetailRecord<'preferences'>[];subjects:EntitySummary[];itemIds:string[];supports:{id:string;people:[string,string];variants:DetailRecord<'support_variants'>[];directionalClaims:DetailRecord<'support_directional_claims'>[]}[]}
export interface ItemReference extends ReferenceScope{item:EntitySummary;profiles:DetailRecord<'item_profiles'>[];requirements:DetailRecord<'item_requirements'>[];actionLinks:DetailRecord<'item_action_links'>[];variants:DetailRecord<'item_variants'>[];recipes:DetailRecord<'recipes'>[];recipeInputs:DetailRecord<'recipe_inputs'>[];acquisition:DetailRecord<'acquisition_sources'>[];containerContents:DetailRecord<'container_contents'>[];locationContents:DetailRecord<'location_contents'>[];shopOffers:DetailRecord<'shop_offers'>[];locations:EntitySummary[]}
export interface LocationReference extends ReferenceScope{location:EntitySummary;region:EntitySummary|null;profiles:DetailRecord<'location_profiles'>[];locationContexts:DetailRecord<'location_contexts'>[];contents:DetailRecord<'location_contents'>[];shops:{entity:EntitySummary;layers:DetailRecord<'inventory_layers'>[];offers:DetailRecord<'shop_offers'>[]}[];targets:EntitySummary[];markers:DetailRecord<'map_markers'>[]}
export interface MapSurfaceReference{surface:EntitySummary;spatial:{id:string;coordinateKind:string;axisOrder:string;unitsX:number|null;unitsY:number|null;flipY:boolean|null;width:number|null;height:number|null};backgroundAssetId:string|null;tileSize:number|null;tileVersion:string|null;tiles:DetailRecord<'map_tiles'>[];geometries:DetailRecord<'map_geometries'>[];categories:{id:string;label:string;group:string;order:number;groupOrder:number}[]}
export interface MarkerReference extends ReferenceScope{marker:DetailRecord<'map_markers'>;categoryIds:string[];location:LocationReference|null}
export interface MarkerSummary{marker:DetailRecord<'map_markers'>;contextIds:string[]}
export interface ClaimEvidence{id:string;recordId:string;fieldPath:string;origin:string;evidenceState:string;valueState:string;value:z.infer<ReturnType<typeof z.json>>;semanticRole:string;contextId:string|null;source:{url:string;pointer:string|null;sha256:string;captureId:string;capturedAt:string;role:string}}
