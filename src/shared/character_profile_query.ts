import type { Field } from './reference_v3';
import type { ReferenceScope,EntitySummary,DetailRecord,ActionSummary } from './reference_details';
import { ROUTE_NAMES } from './catalog';
export function factText(field:Field<unknown>|undefined):string {
  if(!field)return 'Unknown';
  if(field.state==='not_applicable')return 'Not applicable';
  if(field.state==='unresolved')return 'Unresolved';
  if(field.state==='source_null')return 'Not specified';
  if(field.state!=='value'||field.value===null)return 'Unknown';
  return String(field.value);
}
export function contextText(scope:ReferenceScope,id:string|null):string {
  const c=scope.contexts.find(c=>c.id===id);if(!c)return 'Context not documented';
  const routes=c.route_ids.map(r=>ROUTE_NAMES[r]);
  return [routes.length?routes.join(', '):c.route_scope==='all'?'All routes':null,c.part!==null?`Part ${c.part}`:null,c.section_text,c.chapter_low!==null?`Chapter ${c.chapter_low}${c.chapter_high!==null&&c.chapter_high!==c.chapter_low?`–${c.chapter_high}`:''}`:null,c.difficulty_text,c.label].filter((v,i,a)=>v&&a.indexOf(v)===i).join(' · ');
}
export function conditionText(scope:ReferenceScope,id:string|null,names:EntitySummary[]=[],seen=new Set<string>()):string {
  if(!id)return '';if(seen.has(id))return 'Unresolved condition';const c=scope.conditions.find(c=>c.id===id);if(!c)return 'Condition not documented';
  seen.add(id);const value=c.value;
  if(value.kind==='text')return value.text;
  if(value.kind==='skill_grade')return `${value.skill_id.replaceAll('_',' ')} ${value.grade_id}`;
  if(value.kind==='entity')return names.find(n=>n.id===value.target_id)?.name??value.label;
  if(value.kind==='quantity')return value.quantity.raw===null?'Quantity not specified':String(value.quantity.raw);
  if(value.kind==='support_threshold')return `Support level ${value.value}`;
  if(value.kind==='conversation_rank')return `Conversation ${value.rank}${value.variant?` · ${value.variant}`:''}`;
  const children=c.children.map(child=>conditionText(scope,child.id,names,new Set(seen)));
  return `${c.node_kind==='all'?'All of':c.node_kind==='any'?'One of':c.node_kind==='not'?'Not':'Listed conditions'}: ${children.join('; ')}`;
}
export function statObservationText(value:DetailRecord<'stat_values'>|undefined):string {
  if(!value)return 'Unknown';
  return value.body.expression_text.state==='value'?factText(value.body.expression_text):factText(value.body.number_value);
}
export function resolveProfileCharacter(catalog:EntitySummary[],savedId:string|null):string|null {
  return catalog.find(c=>!c.retired&&c.id===savedId)?.id??[...catalog].filter(c=>!c.retired).sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base'})||a.id.localeCompare(b.id))[0]?.id??null;
}

const learningGrades=['E','E+','D','D+','C','C+','B','B+','A','A+','S','S+'];
export function compareLearningRequirements(a:DetailRecord<'learning_awards'>,b:DetailRecord<'learning_awards'>):number {
  const gradeRank=(grade:string|null)=>{const rank=learningGrades.indexOf(grade??'');return rank<0?Infinity:rank;};
  return gradeRank(a.body.grade_id)-gradeRank(b.body.grade_id)
    || (a.body.level_value??Infinity)-(b.body.level_value??Infinity)
    || a.body.acquired_label.localeCompare(b.body.acquired_label)
    || a.id.localeCompare(b.id);
}
export function learningKindOrder(actions:readonly ActionSummary[]) {
  const kinds=new Map(actions.map(a=>[a.id,a.actionKind]));
  // Use documented action identities; a name or training skill cannot establish kind.
  const order=['combat_art','spell','blaze_art','gambit','ability','blaze_ability'];
  const rank=(award:DetailRecord<'learning_awards'>)=>{
    const kind=award.body.acquired_entity_id?kinds.get(award.body.acquired_entity_id):undefined;
    return kind?order.indexOf(kind):order.length;
  };
  return (a:DetailRecord<'learning_awards'>,b:DetailRecord<'learning_awards'>)=>rank(a)-rank(b)||compareLearningRequirements(a,b);
}
