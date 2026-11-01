import {useEffect,useRef,useState} from 'react';
import type {ItemReference} from '../../../shared/reference_details';
import type {MapEntityDetail} from '../../../shared/interactive_map';
import {factText,conditionText,contextText} from '../../../shared/character_profile_query';
import {parameterText} from '../../../shared/action_details';
import {FocusedDetail,type DetailSelection} from '../character_profile/profile_details';

export type MapDetailSelection={id:string;name:string;kind:'item'|'mount'|'battalion'};
export function MapReferenceDialog({selection,onClose}:{selection:MapDetailSelection;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),[data,setData]=useState<ItemReference|MapEntityDetail|null>(),[error,setError]=useState(false),[attempt,setAttempt]=useState(0),[action,setAction]=useState<DetailSelection>();
  useEffect(()=>{const node=dialog.current!,opener=document.activeElement;node.showModal();return()=>{node.close();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true});};},[]);
  useEffect(()=>{let current=true;setData(undefined);setError(false);
    (selection.kind==='item'?window.loom.itemReference(selection.id):window.loom.mapEntityDetail({id:selection.id,kind:selection.kind})).then(d=>{if(current)setData(d);}).catch(()=>{if(current)setError(true);});return()=>{current=false;};
  },[selection.id,selection.kind,attempt]);
  return <><dialog className="map_reference_dialog" ref={dialog} aria-labelledby="map_reference_title" onCancel={e=>{e.preventDefault();onClose();}}>
    <header><div><p className="eyebrow">{selection.kind} reference</p><h2 id="map_reference_title">{selection.name}</h2></div><button autoFocus onClick={onClose} aria-label="Close reference details">×</button></header>
    {error?<p role="alert">Details could not be loaded. <button onClick={()=>setAttempt(a=>a+1)}>Retry</button></p>:data===undefined?<p role="status">Loading details…</p>:data===null?<p>Details not documented.</p>:'entity'in data?<>
      <dl className="map_reference_facts">{data.facts.map((f,i)=><div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
      {data.stats.map((s,i)=><section key={i}><h3>{s.label}</h3><dl className="map_reference_facts">{s.values.map(v=><div key={v.label}><dt>{v.label}</dt><dd>{v.value}</dd></div>)}</dl></section>)}
      {data.actions.map(a=><p key={`${a.id}:${a.label}`}>{a.label}: <button onClick={()=>setAction({kind:'action',id:a.id,name:a.name})}>{a.name}</button></p>)}
    </>:<>
      {data.profiles.map(p=><section key={p.id}><h3>{factText(p.body.category_text)}</h3>{[p.body.description_text,p.body.flavor_text,p.body.effect_text,p.body.use_text].filter(f=>f.state==='value').map((f,i)=><p key={i}>{factText(f)}</p>)}<dl className="map_reference_facts">{Object.entries(p.body.parameters_json).map(([k,v])=><div key={k}><dt>{k.replaceAll('_',' ')}</dt><dd>{parameterText(v)}</dd></div>)}</dl></section>)}
      {!!data.variants.length&&<section><h3>Documented variants</h3>{data.variants.map(v=><p key={v.id}>{v.body.refinement_level===0?'Base':`+${v.body.refinement_level??'?'}`} — {Object.entries(v.body.changes_json).map(([k,n])=>`${k.replaceAll('_',' ')}: ${parameterText(n)}`).join(' · ')||'Changes not documented'}</p>)}</section>}
      {!!data.recipes.length&&<section><h3>Recipes / upgrades</h3>{data.recipes.map(r=><article key={r.id}><strong>{r.body.output_label}</strong><p>{data.recipeInputs.filter(i=>i.body.recipe_id===r.id).map(i=>`${i.body.label} ×${i.body.quantity_json.raw??i.body.quantity_json.number??'?'}`).join(', ')}</p><p>Cost: {factText(r.body.cost_text)}</p>{r.body.condition_id&&<p>{conditionText(data,r.body.condition_id)}</p>}</article>)}</section>}
      {!!data.containerContents.length&&<section><h3>Crate contents / sources</h3>{data.containerContents.map(c=><p key={c.id}>{c.body.label} · {c.body.probability_value.state==='value'&&c.body.probability_value.value!==null?`${(c.body.probability_value.value*100).toLocaleString()}%`:'Rate unknown'}</p>)}</section>}
      <section><h3>Reported acquisition</h3>{data.acquisition.length?data.acquisition.map(a=><article key={a.id}><strong>{a.body.label}</strong>{a.body.source_detail.state==='value'&&<p>{factText(a.body.source_detail)}</p>}<p className="hint">{a.context_id?contextText(data,a.context_id):'Story context not specified'}</p>{a.body.condition_id&&<p>{conditionText(data,a.body.condition_id)}</p>}</article>):<p>Acquisition not documented.</p>}</section>
    </>}
  </dialog>{action&&<FocusedDetail selection={action} onClose={()=>setAction(undefined)} onSelect={setAction} catalog={new Set()} onCharacter={()=>{}}/>}</>;
}
