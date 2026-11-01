import type { ActionReference,DetailRecord } from '../../../shared/reference_details';
import { actionKindLabel,actionParameterCards,hasActionProfileInformation,primaryActionProfile } from '../../../shared/action_details';
import { factText,contextText,conditionText } from '../../../shared/character_profile_query';
import { skillLabel } from '../../../shared/library_setup';
import { Portrait } from '../../components/portrait';
import type { DetailSelection } from './profile_details';
const words=(s:string)=>s.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
function ProfileFacts({profile,data,primary=false}:{profile:DetailRecord<'action_profiles'>;data:ActionReference;primary?:boolean}) {
  const cards=actionParameterCards(profile);
  return <section className="action_popup_profile" data-effect-profile={profile.id}>
    {!primary&&<h3>Other documented effect</h3>}
    {!!cards.length&&<dl className="action_popup_stats">{cards.map(c=><div key={c.key}><dt>{c.label}</dt><dd>{c.value}</dd></div>)}</dl>}
    <p className="action_popup_effect">{factText(profile.body.effect_text)}</p>
    {profile.body.damage_type.state==='value'&&<p>Damage type: {factText(profile.body.damage_type)}</p>}
    {profile.body.equipment_restriction_text.state==='value'&&<p>Equipment requirement: {factText(profile.body.equipment_restriction_text)}</p>}
    {profile.body.upgrade_text.state!=='source_missing'&&<section><h3>Upgrade</h3><p>{factText(profile.body.upgrade_text)}</p></section>}
    {profile.context_id&&<p className="hint">{contextText(data,profile.context_id)}</p>}
  </section>;
}
export function ActionPopupContent({data,ownerRecordId,catalog,onCharacter,onSelect}:{data:ActionReference;ownerRecordId?:string;catalog:Set<string>;onCharacter:(id:string)=>void;onSelect:(s:DetailSelection)=>void}) {
  const profile=primaryActionProfile(data,ownerRecordId),others=data.profiles.filter(p=>p.id!==profile?.id&&hasActionProfileInformation(p));
  const award=data.awards.find(a=>a.id===ownerRecordId),blaze=data.blaze.find(b=>b.id===ownerRecordId);
  const requirement=(a:DetailRecord<'learning_awards'>)=>[
    a.body.skill_id?skillLabel(a.body.skill_id):null,a.body.grade_id,a.body.level_value!==null?`Level ${a.body.level_value}`:null,
    a.body.acquisition_kind==='personal'?'Personal ability':null,a.body.active_at_start===1?'Active at start':null,
    a.body.condition_id?conditionText(data,a.body.condition_id):null,a.context_id?contextText(data,a.context_id):null,
  ].filter(Boolean).join(' · ')||'Acquisition requirement not documented';
  return <>
    <p className="action_popup_kind">{data.action.skillId?`${skillLabel(data.action.skillId)} · `:''}{actionKindLabel(data.action.actionKind)}</p>
    {profile?<ProfileFacts profile={profile} data={data} primary/>:<p>Effect not documented.</p>}
    {award&&<p className="action_popup_acquisition">{requirement(award)}</p>}
    {blaze&&<p className="action_popup_acquisition">{factText(blaze.body.acquisition_text)}{blaze.context_id?` · ${contextText(data,blaze.context_id)}`:''}</p>}
    {others.map(p=><ProfileFacts key={p.id} profile={p} data={data}/>)}
    {!!data.parameters.filter(p=>p.body.variant_id!==null||!profile?.body.parameters_json[p.body.parameter_key as keyof typeof profile.body.parameters_json]).length&&<section><h3>Additional parameters</h3><dl className="profile_facts">{data.parameters.filter(p=>p.body.variant_id!==null||!profile?.body.parameters_json[p.body.parameter_key as keyof typeof profile.body.parameters_json]).map(p=><div key={p.id}><dt>{words(p.body.parameter_key)}</dt><dd>{p.body.quantity_json.raw===null?'Unknown':p.body.quantity_json.raw===''?'Not specified':String(p.body.quantity_json.raw)}{p.context_id?` · ${contextText(data,p.context_id)}`:''}</dd></div>)}</dl></section>}
    {!!data.relations.length&&<section><h3>Related actions</h3>{data.relations.map(r=>{const from=r.body.from_id===data.action.id,otherId=from?r.body.to_id:r.body.from_id,other=data.relatedActions.find(a=>a.id===otherId);return <p key={r.id}>{from?words(r.body.relation):`Reverse relation: ${words(r.body.relation)}`} · {other?<button className="profile_link" onClick={()=>onSelect({kind:'action',id:other.id,name:other.name})}>{other.name}</button>:'Related action not documented'}{r.body.condition_id?` · ${conditionText(data,r.body.condition_id)}`:''}</p>;})}</section>}
    {!!data.items.length&&<section><h3>Related items</h3><div className="action_popup_related">{data.items.map(i=><button key={i.id} onClick={()=>onSelect({kind:'item',id:i.id,name:i.name})}>{i.name}</button>)}</div></section>}
    {!!data.classRewards.length&&<section><h3>Class acquisition</h3>{data.classRewards.map(r=><p key={r.id}><strong>{data.classes.find(c=>c.id===r.body.class_id)?.name??'Class not documented'}</strong> · {words(r.body.reward_kind)}{r.body.exp_required.state==='value'?` · ${factText(r.body.exp_required)} class EXP`:''}{r.context_id?` · ${contextText(data,r.context_id)}`:''}</p>)}</section>}
    <section><h3>Learned by</h3>{data.learners.length?<div className="action_popup_learners">{data.learners.map(l=>{
      const awards=data.awards.filter(a=>l.awardIds.includes(a.id)),blazes=data.blaze.filter(b=>l.blazeIds.includes(b.id));
      const labels=[...new Set(awards.map(a=>a.body.grade_id??(a.body.level_value!==null?`Lv. ${a.body.level_value}`:a.body.acquisition_kind==='personal'?'Personal':'?')).concat(blazes.map(()=> 'Blaze')))];
      const text=[l.character.name,...awards.map(requirement),...blazes.map(b=>factText(b.body.acquisition_text))].join(' · ');
      const body=<><Portrait id={l.character.id} name={l.character.name} variant="details"/><span className="action_popup_grade" aria-hidden="true">{labels.join('/')}</span></>;
      return catalog.has(l.character.id)?<button key={l.character.id} title={text} aria-label={text} onClick={()=>onCharacter(l.character.id)}>{body}</button>:<span key={l.character.id} title={text} aria-label={text}>{body}</span>;
    })}</div>:<p>Character learning not documented.</p>}</section>
  </>;
}
