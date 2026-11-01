import type { ActionReference,DetailRecord } from './reference_details';
import { factText } from './character_profile_query';
import type { Field } from './reference_v3';
export const ACTION_PARAMETER_LABELS:Record<string,string>={cost:'Cost',might:'Might',hit:'Hit',crit:'Crit',range:'Range',hp_cost:'HP cost',blaze_required:'Blaze required',blaze_cost:'Blaze cost',weight:'Weight',uses:'Uses',avoid:'Avoid',curse:'Curse',price:'Price',activation:'Activation',limit:'Limit',limit_upgraded:'Upgraded limit',durability:'Durability',effect:'Effect',damage_type:'Damage type'};
export const actionKindLabel=(kind:string)=>({combat_art:'Combat art',ability:'Ability',spell:'Spell',blaze_art:'Blaze art',blaze_ability:'Blaze ability',gambit:'Gambit'}[kind]??kind);
export function parameterText(field:Field<unknown>|undefined):string {
 if(!field||field.state!=='value')return factText(field);
 if(field.value!==null&&typeof field.value==='object'&&'raw' in field.value){const raw=field.value.raw;return raw===null?'Unknown':raw===''?'Not specified':String(raw);}
 return factText(field);
}
export function primaryActionProfile(data:ActionReference,ownerRecordId?:string):DetailRecord<'action_profiles'>|undefined {
 const ownerId=data.profileLinks.find(l=>l.ownerRecordId===ownerRecordId)?.profileRecordId;
 return data.profiles.find(p=>p.id===(ownerId??data.action.profileRecordId));
}
export function hasActionProfileInformation(p:DetailRecord<'action_profiles'>):boolean {
 return [p.body.effect_text,p.body.damage_type,p.body.equipment_restriction_text,p.body.upgrade_text,...Object.values(p.body.parameters_json)].some(f=>f&&['value','unresolved','source_null'].includes(f.state));
}
export function actionParameterCards(profile:DetailRecord<'action_profiles'>|undefined) {
 if(!profile)return [];
 const keys=[...Object.keys(ACTION_PARAMETER_LABELS),...Object.keys(profile.body.parameters_json)];
 return [...new Set(keys)].filter(k=>profile.body.parameters_json[k as keyof typeof profile.body.parameters_json]!==undefined).map(key=>({key,label:ACTION_PARAMETER_LABELS[key]??key.replaceAll('_',' '),value:parameterText(profile.body.parameters_json[key as keyof typeof profile.body.parameters_json])}));
}
