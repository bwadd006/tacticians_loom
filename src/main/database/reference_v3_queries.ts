import type Database from 'better-sqlite3';
import { ROUTES, ROUTE_NAMES, SKILLS, STATS, TIERS, type Route, type RouteContext, type Stat, type Skill } from '../../shared/catalog';
import { characterSchema, classSchema, paralogueSchema, type Character, type CharacterClass, type Paralogue, type ClassUnlock, type CertificationRules } from '../../shared/source_models';
import type { ClassLibraryData, ParalogueLibraryData, ReferenceConflict, ReferenceOverview } from '../../shared/api';

type Row = Record<string, string | number | null>;
const rows = (db: Database.Database, sql: string, ...args: (string|number)[]) => db.prepare(sql).all(...args) as Row[];
const one = (db: Database.Database, sql: string, ...args: (string|number)[]) => rows(db,sql,...args)[0];
const text = (value: unknown) => typeof value === 'string' ? value : null;
const number = (value: unknown) => typeof value === 'number' ? value : null;
const label = (db:Database.Database,id:unknown) => typeof id === 'string' ? text(one(db,'SELECT display_name FROM entities WHERE id=?',id)?.display_name) : null;
const source = 'Reported preferred-source evidence';
function statVector(db:Database.Database,owner:string,role:string) {
  const profiles = rows(db,'SELECT p.record_id FROM stat_profiles p JOIN records r ON r.id=p.record_id WHERE owner_id=? AND role=? AND level_low IS NULL AND level_high IS NULL AND level_text IS NULL AND interpretation_state=? AND r.context_id IS NULL AND modifier_source_id IS NULL',owner,role,'selected');
  // Multiple unqualified profiles are ambiguous, never silently averaged or chosen by row order.
  const unit=role==='personal_growth'?'percent':role==='growth_modifier'?'percentage_points':'stat_points';
  const values = profiles.length === 1 ? rows(db,'SELECT * FROM stat_values WHERE profile_id=? AND unit=?',String(profiles[0].record_id),unit) : [];
  return Object.fromEntries(STATS.map(stat => [stat,number(values.find(v => v.stat_id === stat && v.value_state === 'value')?.number_value)])) as Record<Stat,number|null>;
}
function scopedRoutes(db:Database.Database,context:unknown): Route[] {
  if (typeof context !== 'string') return [];
  const row = one(db,'SELECT * FROM contexts WHERE id=?',context);
  if (!row || row.part !== 1 || row.part_state !== 'specified') return [];
  if (row.route_scope === 'all') return [...ROUTES];
  if (row.route_scope !== 'listed') return [];
  return rows(db,'SELECT route_id FROM context_routes WHERE context_id=?',context).map(r => String(r.route_id) as Route);
}
function conditionsText(db:Database.Database,root:unknown,seen=new Set<string>()): string {
  if (typeof root !== 'string' || seen.has(root)) return '';
  seen.add(root); const node = one(db,'SELECT * FROM conditions WHERE id=?',root); if (!node) return '';
  const payload = JSON.parse(String(node.value_json)) as {kind:string;text?:string;label?:string;skill_id?:string;grade_id?:string;value?:number;rank?:string};
  if (node.node_kind === 'leaf') {
    if (payload.kind === 'skill_grade') return `${payload.skill_id} ${payload.grade_id}`;
    if (payload.kind === 'support_threshold') return `Support ${payload.value}`;
    if (payload.kind === 'conversation_rank') return `Conversation ${payload.rank}`;
    return payload.text ?? payload.label ?? String(node.predicate ?? 'Unresolved condition');
  }
  const children = rows(db,'SELECT child_id FROM condition_children WHERE parent_id=? ORDER BY display_order',root).map(r => conditionsText(db,r.child_id,new Set(seen)));
  return `${node.node_kind === 'any' ? 'One of' : node.node_kind === 'all' ? 'All of' : node.node_kind === 'not' ? 'Not' : 'Unspecified logic'} (${children.join('; ')})`;
}
function recruitment(db:Database.Database,id:string): Character['recruitment_by_route'] {
  const events = rows(db,'SELECT e.*,r.context_id FROM recruitment_events e JOIN records r ON r.id=e.record_id WHERE character_id=? ORDER BY e.record_id',id);
  return Object.fromEntries(ROUTES.map(route => {
    const relevant = events.filter(e => scopedRoutes(db,e.context_id).includes(route) && e.event_scope_state === 'reported');
    // Only a single comparable event can feed the existing combined recruitment cells.
    const e = relevant.length === 1 ? relevant[0] : undefined;
    const kinds: Record<string,Character['recruitment_by_route'][Route]['status']> = {recruitable:'recruitable',automatic:'automatic',mandatory_tutorial:'mandatory_tutorial'};
    return [route,{status:e ? kinds[String(e.join_kind)] ?? 'unknown' : 'unknown',earliest_chapter:number(e?.chapter_value),min_renown:number(e?.renown_value),min_support:number(e?.support_value),
      requirements:relevant.flatMap(event => [conditionsText(db,event.condition_id)].filter(Boolean).map(t => ({type:'source_condition',text:t}))),missable:null,source}];
  })) as unknown as Character['recruitment_by_route'];
}
export function getCharacterV3(db:Database.Database,id:string): Character|null {
  if (!one(db,'SELECT id FROM characters WHERE id=?',id)) return null;
  const recruitmentByRoute = recruitment(db,id);
  const positive = ROUTES.filter(r => ['automatic','recruitable','mandatory_tutorial'].includes(recruitmentByRoute[r].status));
  const initial = rows(db,'SELECT * FROM initial_skills WHERE character_id=?',id);
  const affinities = Object.fromEntries(SKILLS.map(skill => [skill,text(initial.find(v => v.skill_id === skill && v.affinity_state === 'value')?.affinity) ?? 'unknown']));
  const complete = SKILLS.every(s => affinities[s] !== 'unknown');
  const start = rows(db,'SELECT * FROM starting_states WHERE character_id=?',id);
  const starting = start.length === 1 ? start[0] : undefined;
  const abilities = rows(db,`SELECT a.*,e.display_name,p.effect_text FROM learning_awards a JOIN entities e ON e.id=a.acquired_entity_id
    JOIN actions ac ON ac.id=a.acquired_entity_id
    LEFT JOIN source_mentions m ON m.record_id=a.record_id AND m.field_path='/effect_profile'
    JOIN action_profiles p ON p.record_id=coalesce(json_extract(m.context_json,'$.profile_record_id'),ac.profile_record_id)
    WHERE a.character_id=? AND a.acquisition_kind IN ('personal','personal_equippable') ORDER BY CASE a.acquisition_kind WHEN 'personal' THEN 0 ELSE 1 END,a.level_value,a.record_id`,id);
  return characterSchema.parse({id,name:label(db,id),availability_category:'source_roster',growth_rates_percent:statVector(db,id,'personal_growth'),growth_rates_source:source,
    effective_personal_growth_rates_percent:null,effective_growth_rates_note:'Conditional and class adjustments remain separate reference profiles.',
    starting_level:number(starting?.level_value),starting_class:label(db,starting?.class_id),base_stats:null,base_stats_note:'Starting observations are retained separately; unadjusted personal bases are not inferred.',
    skill_proficiencies:{boons:complete ? SKILLS.filter(s => affinities[s] === 'boon') : null,banes:complete ? SKILLS.filter(s => affinities[s] === 'bane') : null,verified:false,source,affinities},
    personal_abilities:abilities.map(a => ({action_id:a.acquired_entity_id,name:a.display_name,effect:a.effect_text,acquisition:{type:a.acquisition_kind==='personal'?'personal':a.level_value===null?'equippable':'level',level:a.level_value},source,rank:null})),
    recruitment_by_route:recruitmentByRoute,flags:{recruitable_or_joins_in_part_1:positive.length>0,available_part_1_routes:positive},notes:[]});
}
export function listCharactersV3(db:Database.Database,route:RouteContext): Character[] {
  return rows(db,'SELECT c.id FROM characters c JOIN entities e ON e.id=c.id WHERE e.retired=0 ORDER BY e.display_name COLLATE NOCASE,e.id')
    .map(r => getCharacterV3(db,String(r.id))!).filter(c => route === 'all' ? c.flags.recruitable_or_joins_in_part_1 : c.flags.available_part_1_routes.includes(route));
}
function unlocksV3(db:Database.Database):ClassUnlock[] {
  const outcomes = rows(db,`SELECT o.*,r.context_id FROM activity_outcomes o JOIN records r ON r.id=o.record_id WHERE outcome_kind='class_unlock' ORDER BY o.record_id`);
  return outcomes.flatMap(o => {
    const ctx = typeof o.context_id === 'string' ? one(db,'SELECT * FROM contexts WHERE id=?',o.context_id) : undefined;
    // A null route cannot label unknown scope as shared. Keep such evidence in the canonical model.
    if (!ctx || !['listed','all','unknown'].includes(String(ctx.route_scope)) || !o.target_id) return [];
    const routes = ctx.route_scope === 'listed' ? rows(db,'SELECT route_id FROM context_routes WHERE context_id=?',String(ctx.id)).map(r => String(r.route_id)) : [null];
    return routes.map(route => ({id:`${o.record_id}:${route ?? ctx.route_scope}`,route_id:route as Route|null,route_scope:String(ctx.route_scope) as 'listed'|'all'|'unknown',unlock_class_ids:[String(o.target_id)],part:number(ctx.part),earliest_chapter:number(ctx.chapter_low),
      activity_name:label(db,o.activity_id) ?? String(o.label),requirements:{reported:conditionsText(db,o.condition_id)},deadline_in_game:null,missable:null,persists_across_routes:null,status:'reported',source_url:'https://yuphastemple.com/'}));
  });
}
export function getClassV3(db:Database.Database,id:string):CharacterClass|null {
  const c = one(db,'SELECT * FROM classes WHERE id=?',id); if (!c) return null;
  if (!(TIERS as readonly unknown[]).includes(c.tier_id)) throw new Error(`Class ${id} has an unresolved tier and cannot enter the tiered library`);
  const profiles = rows(db,'SELECT * FROM class_profiles WHERE class_id=?',id), profile = profiles.length === 1 ? profiles[0] : undefined;
  const skills = rows(db,'SELECT * FROM class_skills WHERE class_id=?',id);
  const certificates = rows(db,'SELECT * FROM class_certifications WHERE class_id=?',id), cert = certificates.length === 1 ? certificates[0] : undefined;
  const rewards = rows(db,`SELECT r.*,p.effect_text FROM class_rewards r LEFT JOIN actions a ON a.id=r.action_id
    LEFT JOIN source_mentions m ON m.record_id=r.record_id AND m.field_path='/effect_profile'
    LEFT JOIN action_profiles p ON p.record_id=coalesce(json_extract(m.context_json,'$.profile_record_id'),a.profile_record_id) WHERE class_id=? ORDER BY r.record_id`,id);
  const mastery = rewards.filter(r => r.reward_kind === 'mastery');
  const reward = mastery.length === 1 ? mastery[0] : undefined;
  const grades: {skill_id:Skill;grade:string}[] = [];
  function collect(root:unknown) {
    if (typeof root !== 'string') return;
    const node = one(db,'SELECT value_json FROM conditions WHERE id=?',root); if (!node) return;
    const value = JSON.parse(String(node.value_json)) as {kind:string;skill_id:Skill;grade_id:string};
    if (value.kind === 'skill_grade') grades.push({skill_id:value.skill_id,grade:value.grade_id});
    for (const child of rows(db,'SELECT child_id FROM condition_children WHERE parent_id=? ORDER BY display_order',root)) collect(child.child_id);
  }
  collect(cert?.grade_root_id);
  const accessible = skills.filter(s => ['reported','confirmed','allowed'].includes(String(s.access_state))).map(s => String(s.skill_id) as Skill);
  return classSchema.parse({id,name:label(db,id),tier:c.tier_id,playable:null,
    movement_tags:profile?.movement_types_json && Array.isArray(JSON.parse(String(profile.movement_types_json))) ? JSON.parse(String(profile.movement_types_json)) : [],
    skill_exp_bonuses:Object.fromEntries(skills.filter(s => s.training_bonus !== null).map(s => [s.skill_id,s.training_bonus])),
    skills_listed_without_exp_bonus:skills.filter(s => s.training_bonus === 0).map(s => s.skill_id),
    weapon_access:{usable_weapon_types:accessible.some(s=>['swords','spears','axes','bows','gauntlets'].includes(s)) ? accessible.filter(s => ['swords','spears','axes','bows','gauntlets'].includes(s)) : null,
      usable_magic_types:accessible.some(s=>['black_magic','white_magic'].includes(s)) ? accessible.filter(s => ['black_magic','white_magic'].includes(s)) : null,verified:false,evidence_state:accessible.length?'reported':'unknown',note:'Reported use assertions are distinct from verified access; omitted skills remain unknown.'},
    class_growth_rate_modifiers_percent:statVector(db,id,'growth_modifier'),base_stat_modifiers:statVector(db,id,'flat_modifier'),
    active_class_abilities:rewards.filter(r => r.reward_kind === 'inherent').map(r => ({action_id:r.action_id??undefined,name:r.label,effect:r.effect_text,source})),
    mastery:{action_id:text(reward?.action_id),ability_name:text(reward?.label),effect:text(reward?.effect_text),class_exp_required:number(reward?.exp_required),retained_on_reclass:reward?.retention_state === 'retained' ? true : reward?.retention_state === 'lost' ? false : null},
    certification:{tier_rule_id:c.tier_id,recommended_skill_grades:grades.length ? grades : null,skill_rule_is_complete:cert?.completeness === 'complete',
      logic:conditionsText(db,cert?.grade_root_id) || null,grade_source:source,exam_pass_probability_formula:null,exact_minimum_level:null,character_exceptions:null,
      reported_requirements:cert?.grade_root_id ? {root_id:cert.grade_root_id,summary:conditionsText(db,cert.grade_root_id),evidence:'reported'} : null,
      listed_level:number(cert?.listed_level),listed_renown:number(cert?.listed_renown),license_label:label(db,cert?.license_id)},
    known_character_restrictions:cert?.restriction_text ? [{reported:cert.restriction_text}] : null,
    unlock_ids:unlocksV3(db).filter(u => u.unlock_class_ids.includes(id)).map(u => u.id),source_urls:['https://yuphastemple.com/']});
}
export function getClassLibraryV3(db:Database.Database):ClassLibraryData {
  const classes = rows(db,'SELECT c.id FROM classes c JOIN entities e ON e.id=c.id WHERE e.retired=0 ORDER BY e.display_name COLLATE NOCASE,e.id').map(r => getClassV3(db,String(r.id))!)
    .sort((a,b) => TIERS.indexOf(a.tier)-TIERS.indexOf(b.tier) || a.name.localeCompare(b.name,'en'));
  const certificationRules = Object.fromEntries(TIERS.map(tier => [tier,{license:null,ideal_character_level:null,minimum_renown_level:null,requires_exam:null}])) as CertificationRules;
  return {classes,certificationRules,unlocks:unlocksV3(db),restrictions:{verified:false,note:'Individual eligibility and omitted restrictions remain unconfirmed.'},
    conflicts:conflictsV3(db).filter(c => typeof c.class_id === 'string').map(c => ({classId:String(c.class_id),field:c.field,status:c.status}))};
}
export function getParalogueLibraryV3(db:Database.Database):ParalogueLibraryData {
  const paralogues = rows(db,'SELECT p.* FROM paralogues p JOIN entities e ON e.id=p.id WHERE e.retired=0 ORDER BY e.display_name COLLATE NOCASE,e.id').map(p => {
    const availability = rows(db,'SELECT a.*,r.context_id FROM activity_availability a JOIN records r ON r.id=a.record_id WHERE activity_id=?',String(p.id));
    const routeAvailability = Object.fromEntries(ROUTES.map(route => {
      const relevant = availability.filter(a => scopedRoutes(db,a.context_id).includes(route));
      const a = relevant.length === 1 ? relevant[0] : undefined;
      const times = relevant.flatMap(e => rows(db,'SELECT * FROM time_assertions WHERE owner_record_id=? ORDER BY source_order,record_id',String(e.record_id)));
      const date = (role:string) => {
        const candidates = times.filter(t => t.timing_role === role && t.semantics_state === 'specified');
        if(candidates.length!==1) return null;
        const time=candidates[0],start=time.start_month!==null&&time.start_day!==null ? {month:time.start_month,day:time.start_day}:null;
        const end=time.end_month!==null&&time.end_day!==null ? {month:time.end_month,day:time.end_day}:null;
        if(start&&end&&(start.month!==end.month||start.day!==end.day)) return null;
        return start??end;
      };
      return [route,{status:a?.availability_state === 'available' ? 'available' : a?.availability_state === 'unavailable' ? 'unavailable' : 'unknown',earliest_chapter:null,
        acceptance_windows:times.filter(t => t.timing_role === 'acceptance' && t.semantics_state === 'specified').map(t => ({start:t.start_month !== null && t.start_day !== null ? {month:t.start_month,day:t.start_day} : null,end:t.end_month !== null && t.end_day !== null ? {month:t.end_month,day:t.end_day} : null,note:text(t.time_text)})),
        listed_completion_deadline:date('completion_deadline'),effective_completion_deadline:date('effective_deadline'),forced_start_date:date('forced_start'),missable:null,trigger:a ? conditionsText(db,a.condition_id) || null : null,
        verification_status:a ? 'reported' : 'unknown',source_keys:['preferred_source'],note:null,reported_timing:times.map(t => ({role:String(t.timing_role),text:String(t.timing_text),semantics:String(t.semantics_state)}))}];
    }));
    const outcomes = rows(db,'SELECT o.*,r.context_id FROM activity_outcomes o JOIN records r ON r.id=o.record_id WHERE activity_id=?',String(p.id)).filter(o => scopedRoutes(db,o.context_id).length > 0);
    return paralogueSchema.parse({id:p.id,name:p.title_state === 'supplied' && p.source_title ? p.source_title : `${p.source_label} — paralogue`,associated_character_name:label(db,p.associated_person_id) ?? p.source_label,
      associated_character_id:typeof p.associated_person_id === 'string' && one(db,'SELECT id FROM characters WHERE id=?',p.associated_person_id) ? p.associated_person_id : null,
      verification_status:'reported',source_keys:['preferred_source'],route_availability:routeAvailability,
      requirements:availability.filter(a => a.condition_id !== null && scopedRoutes(db,a.context_id).length > 0).map(a => ({type:'other',text:conditionsText(db,a.condition_id),route_ids:scopedRoutes(db,a.context_id),character_id:null,paralogue_id:null,support_threshold:null,verification_status:'reported',source_keys:['preferred_source']})),
      outcomes:outcomes.map(o => {const quantity=JSON.parse(String(o.quantity_json)) as {number:number|null;qualifier:string};return {type:['recruited_character','class_unlock','unique_equipment','battalion','ability','currency','renown'].includes(String(o.outcome_kind)) ? o.outcome_kind : 'other',name:String(o.label),quantity:quantity.qualifier==='exact'&&quantity.number!==null&&quantity.number>0?quantity.number:null,text:String(o.label),route_ids:scopedRoutes(db,o.context_id),character_id:['recruited_character','recruitment_opportunity'].includes(String(o.outcome_kind)) ? o.target_id : null,class_id:o.outcome_kind === 'class_unlock' ? o.target_id : null,condition:conditionsText(db,o.condition_id) || null,verification_status:'reported',source_keys:['preferred_source']};}),notes:[]});
  });
  return {paralogues,conflicts:conflictsV3(db).filter(c=>typeof c.paralogue_id==='string').map(c=>({paralogueId:String(c.paralogue_id),routeId:(c.route_id??null) as Route|null,field:c.field,status:c.status,details:'Conflicting source assertions retained in reference evidence.'}))};
}
export function conflictsV3(db:Database.Database):ReferenceConflict[] {
  return rows(db,`SELECT r.entity_id,r.context_id,c.field_path,c.evidence_state,e.kind FROM source_claims c JOIN records r ON r.id=c.record_id LEFT JOIN entities e ON e.id=r.entity_id WHERE c.evidence_state='conflicting' ORDER BY c.id`)
    .map(r => ({character_id:r.kind === 'character' ? text(r.entity_id) : null,class_id:r.kind === 'class' ? text(r.entity_id) : null,paralogue_id:r.kind==='paralogue'?text(r.entity_id):null,
      route_id:scopedRoutes(db,r.context_id).length===1?scopedRoutes(db,r.context_id)[0]:null,field:String(r.field_path),status:String(r.evidence_state)}));
}
export function getOverviewV3(db:Database.Database):ReferenceOverview {
  const meta = (key:string) => JSON.parse(String(one(db,'SELECT value_json FROM build_metadata WHERE key=?',key)?.value_json ?? 'null'));
  const count = (table:string) => Number(one(db,`SELECT count(*) AS n FROM "${table}" t JOIN entities e ON e.id=t.id WHERE e.retired=0`)?.n);
  return {datasetVersion:String(meta('dataset_version')),changeSummary:String(meta('change_summary')),characterCount:count('characters'),classCount:count('classes'),paralogueCount:count('paralogues'),
    actOneCount:listCharactersV3(db,'all').length,conflictCount:conflictsV3(db).length,routes:ROUTES.map(id => ({id,name:ROUTE_NAMES[id],count:listCharactersV3(db,id).length}))};
}
