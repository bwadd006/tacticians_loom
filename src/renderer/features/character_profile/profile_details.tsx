import { useEffect,useRef,useState } from 'react';
import type { ActionReference,ItemReference,CrestReference } from '../../../shared/reference_details';
import { factText,conditionText,contextText } from '../../../shared/character_profile_query';
import { parameterText } from '../../../shared/action_details';
import { ActionIcon } from '../../components/action_icon';
import { CrestIcon } from '../../components/crest_icon';
import { CrestPopupContent } from './crest_popup';
import { ActionPopupContent } from './action_popup';
export type DetailSelection={kind:'action'|'item'|'crest';id:string;name:string;ownerRecordId?:string};
export function FocusedDetail({selection,onClose,onSelect,catalog,onCharacter}:{selection:DetailSelection;onSelect:(s:DetailSelection)=>void;onClose:()=>void;catalog:Set<string>;onCharacter:(id:string)=>void}) {
  const ref=useRef<HTMLDialogElement>(null),[result,setResult]=useState<{key:string;data:ActionReference|ItemReference|CrestReference|null|undefined;error:boolean}>({key:'',data:undefined,error:false}),[attempt,setAttempt]=useState(0);
  const key=`${selection.kind}:${selection.id}`;
  useEffect(()=>{const d=ref.current!,opener=document.activeElement;d.showModal();return()=>{d.close();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus();};},[]);
  useEffect(()=>{let active=true;setResult({key,data:undefined,error:false});(selection.kind==='action'?window.loom.actionReference(selection.id):selection.kind==='crest'?window.loom.crestReference(selection.id):window.loom.itemReference(selection.id)).then(data=>{if(active)setResult({key,data,error:false});}).catch(()=>{if(active)setResult({key,data:undefined,error:true});});return()=>{active=false;};},[selection.id,selection.kind,key,attempt]);
  const data=result.key===key?result.data:undefined,error=result.key===key&&result.error;
  return <dialog ref={ref} className={`profile_detail_dialog${selection.kind!=='item'?' profile_action_dialog':''}`} aria-labelledby="profile_detail_title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}>
    <header><h2 id="profile_detail_title">{selection.kind==='action'&&<ActionIcon id={selection.id}/>}{selection.kind==='crest'&&<CrestIcon id={selection.id}/>}<span>{selection.name}</span></h2><button aria-label="Close details" onClick={onClose} autoFocus>×</button></header>
    {error?<div role="alert">Details could not be loaded. <button onClick={()=>setAttempt(n=>n+1)}>Retry</button></div>:data===undefined?<p role="status">Loading details…</p>:data===null?<p>Details not documented.</p>:'crest' in data?<CrestPopupContent data={data} catalog={catalog} onCharacter={onCharacter}/>: 'action' in data?<ActionPopupContent data={data} ownerRecordId={selection.ownerRecordId} catalog={catalog} onCharacter={onCharacter} onSelect={onSelect}/>:<>
      {data.profiles.map(p=><section key={p.id}><h3>{factText(p.body.category_text)}</h3>{[p.body.description_text,p.body.flavor_text,p.body.effect_text,p.body.use_text].filter(f=>f.state==='value').map((f,i)=><p key={i}>{factText(f)}</p>)}<dl className="profile_facts">{Object.entries(p.body.parameters_json).map(([k,v])=><div key={k}><dt>{k.replaceAll('_',' ')}</dt><dd>{parameterText(v)}</dd></div>)}</dl></section>)}
      <section><h3>Acquisition</h3>{data.acquisition.length?data.acquisition.map(a=><article key={a.id}><strong>{a.body.label}</strong><p>{factText(a.body.source_summary)}</p>{a.body.source_detail.state==='value'&&<p>{factText(a.body.source_detail)}</p>}<p className="hint">{contextText(data,a.context_id)}</p>{a.body.condition_id&&<p>{conditionText(data,a.body.condition_id)}</p>}</article>):<p>Acquisition not documented.</p>}</section>
    </>}
  </dialog>;
}
