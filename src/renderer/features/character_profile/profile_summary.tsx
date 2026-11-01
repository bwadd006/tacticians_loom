import { PROFILE_SKILLS } from '../../../shared/character_profile';
import type { CharacterProfile,ClassPreviewBoundary } from '../../../shared/character_profile';
import type { PlanningController } from '../shortlist/types';
import { STATS,SKILLS } from '../../../shared/catalog';
import { STAT_HEADERS,skillLabel } from '../../../shared/library_setup';
import { factText,statObservationText,contextText,conditionText } from '../../../shared/character_profile_query';
import { Portrait } from '../../components/portrait';
import { SkillIcon } from '../../components/skill_icon';
import { CharacterNoteEditor } from '../shortlist/character_note_editor';
export function ProfileSummary({profile:p,planning,onChoose,preview}:{profile:CharacterProfile;planning:PlanningController;onChoose:()=>void;preview:ClassPreviewBoundary}) {
  const c=p.character,record=planning.records.find(r=>r.characterId===c.id),pending=planning.pendingIds.has(c.id);
  const names=(id:string|null)=>p.related.find(e=>e.id===id)?.name??'Unknown';
  const stats=(id:string)=>p.statValues.filter(v=>v.body.profile_id===id);
  const roles:Record<string,string>={personal_growth:'Personal growths',displayed_base_observation:'Reported starting stats',level_one_observation:'Reported level-one observation',conditional_growth_adjustment:'Conditional growth adjustment'};
  const sorted=[...p.statProfiles].sort((a,b)=>(a.body.role==='personal_growth'?-1:b.body.role==='personal_growth'?1:0));
  const statSection=(s:CharacterProfile['statProfiles'][number])=><section key={s.id} data-stat-role={s.body.role}><h3>{roles[s.body.role]??s.body.role.replaceAll('_',' ')}</h3>{s.body.role==='personal_growth'?<p className="hint">Personal level-up growth rates; class modifiers excluded.</p>:<p className="hint">{s.body.level_text??(s.body.level_low!==null?`Level ${s.body.level_low}${s.body.level_high!==s.body.level_low&&s.body.level_high!==null?`–${s.body.level_high}`:''}`:'Reported observation')}{s.body.class_id?` · ${names(s.body.class_id)}`:''}{s.body.interpretation_state==='unadjusted_personal_base_unresolved'?' · Class/ability adjustments unresolved.':''}</p>}
      <dl className="profile_stats">{STATS.map(stat=><div key={stat}><dt>{STAT_HEADERS[stat]}</dt><dd>{statObservationText(stats(s.id).find(v=>v.body.stat_id===stat))}</dd></div>)}</dl>
      {s.context_id&&<p className="hint">{contextText(p,s.context_id)}</p>}{s.body.role==='conditional_growth_adjustment'&&<p className="hint">Apply only under its documented condition. {s.body.modifier_source_id?names(s.body.modifier_source_id):''} {p.recordConditions.filter(c=>c.recordId===s.id).map(c=>conditionText(p,c.conditionId,p.related)).filter(Boolean).join('; ')}</p>}
    </section>;
  return <aside className="profile_summary" aria-label="Character summary" data-preview-state={preview.kind}>
    <button className="profile_identity_button" onClick={onChoose} aria-haspopup="dialog"><div><span className="eyebrow">Character Profile</span><h2>{c.name} <span aria-hidden="true">▾</span></h2><span className="hint">Choose character</span></div><Portrait id={c.id} name={c.name} variant="details" /></button>
    {p.identity.map(i=><div key={i.id} className="profile_identity_text">{[i.body.epithet_text,i.body.faction_text,i.body.gender_text,i.body.bloodmark_text].filter(f=>f.state==='value').map((f,n)=><p key={n}>{factText(f)}</p>)}{i.body.unique_class_id&&<p>Unique class: {names(i.body.unique_class_id)}</p>}</div>)}
    <section><h3>Starting information</h3>{p.startingStates.length?p.startingStates.map(s=><div key={s.id}><p><strong>{names(s.body.class_id)}</strong> · Level {factText(s.body.level_value)}</p>{s.context_id&&<p className="hint">{contextText(p,s.context_id)}</p>}{p.movement.filter(m=>m.startingStateId===s.id).map(m=><p key={m.startingStateId}>Starting-class movement: <strong>{factText(m.value)}</strong></p>)}</div>):<p>Starting information not documented.</p>}</section>
    {sorted.filter(s=>s.body.role==='personal_growth').map(statSection)}
    <section><h3>Skills & affinities</h3><div className="profile_skills">{PROFILE_SKILLS.map(skill=>{const s=p.initialSkills.find(s=>s.body.skill_id===skill),affinity=s?.body.affinity.value;return <div key={skill}><SkillIcon skill={skill} variant={affinity==='boon'||affinity==='bane'?affinity:'neutral'} /><span>{skillLabel(skill)}</span><strong>{factText(s?.body.grade_id)}</strong><small>{affinity?affinity[0].toUpperCase()+affinity.slice(1):'Unknown'}</small></div>;})}</div><p className="hint">Training affinities do not establish weapon permissions.</p></section>
    {sorted.filter(s=>s.body.role!=='personal_growth').map(statSection)}
    <section className="profile_player_controls"><button disabled={pending} aria-pressed={record?.shortlisted??false} className="shortlist_toggle" onClick={()=>void planning.setShortlisted(c.id,!(record?.shortlisted??false)).catch(()=>undefined)}>{record?.shortlisted?'★ Shortlisted':'☆ Add to shortlist'}</button>{planning.error&&<p role="alert">{planning.error}</p>}
      <details><summary>Personal note</summary><CharacterNoteEditor key={c.id} planning={record??{characterId:c.id,note:'',shortlisted:false,shortlistedAt:null,createdAt:'',updatedAt:'',datasetVersionAtUpdate:''}} onSave={note=>planning.saveNote(c.id,note)} onClear={()=>planning.clearNote(c.id)} /></details>
    </section>
  </aside>;
}
