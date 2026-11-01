import type { CrestReference } from '../../../shared/reference_details';
import { factText } from '../../../shared/character_profile_query';
import { Portrait } from '../../components/portrait';
export function CrestPopupContent({data,catalog,onCharacter}:{data:CrestReference;catalog:Set<string>;onCharacter:(id:string)=>void}) {
 return <>
  <p className="action_popup_kind">Bloodmark / crest</p>
  {data.profiles.length?data.profiles.map(p=><section key={p.id}><p>{p.body.effect_text.state==='source_missing'||p.body.effect_text.value===''?'Effect not documented.':factText(p.body.effect_text)}</p>{p.body.trigger_json.raw!==null&&<p>Trigger: {String(p.body.trigger_json.raw)}{p.body.trigger_json.unit?` ${p.body.trigger_json.unit}`:''}</p>}</section>):<p>Effect not documented.</p>}
  <section><h3>Documented bearers</h3>{data.people.length?<div className="crest_popup_bearers">{data.people.map(person=>{
   const associations=data.associations.filter(a=>a.body.person_id===person.id);
   return <article key={person.id}>{catalog.has(person.id)?<button className="crest_bearer_link" onClick={()=>onCharacter(person.id)}><Portrait id={person.id} name={person.name} variant="details"/><strong>{person.name}</strong></button>:<strong>{person.name}</strong>}{associations.map(a=><div key={a.id}><p className="hint">{a.body.dragon_label.state==='value'&&a.body.dragon_label.value?factText(a.body.dragon_label):'Dragon association not documented.'}</p>{a.body.effect_text.state==='value'&&a.body.effect_text.value&&!data.profiles.some(p=>p.body.effect_text.value===a.body.effect_text.value)&&<p>{factText(a.body.effect_text)}</p>}</div>)}</article>;
  })}</div>:<p>Bearers not documented.</p>}</section>
 </>;
}
