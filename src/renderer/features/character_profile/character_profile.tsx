import { useEffect,useRef,useState } from 'react';
import { PROFILE_TABS,DEFERRED_CLASS_PREVIEW,type CharacterProfile as Profile,type ProfileTab } from '../../../shared/character_profile';
import type { EntitySummary } from '../../../shared/reference_details';
import { resolveProfileCharacter } from '../../../shared/character_profile_query';
import type { PlanningController } from '../shortlist/types';
import { Portrait } from '../../components/portrait';
import { ProfileSummary } from './profile_summary';
import { ProfileTabContent } from './profile_tabs';
import { FocusedDetail,type DetailSelection } from './profile_details';
import './character_profile.css';
function useResource<T>(id:string|null,load:(id:string)=>Promise<T|null>) {
  const cache=useRef(new Map<string,Promise<T|null>>()),[attempt,setAttempt]=useState(0);
  const [result,setResult]=useState<{id:string|null;value:T|null|undefined;error:boolean}>({id:null,value:undefined,error:false});
  useEffect(()=>{if(!id)return;let current=true;setResult({id,value:undefined,error:false});let request=cache.current.get(id);if(!request){request=load(id);cache.current.set(id,request);}
    request.then(value=>{if(current)setResult({id,value,error:value===null});}).catch(()=>{cache.current.delete(id);if(current)setResult({id,value:undefined,error:true});});return()=>{current=false;};
  },[id,load,attempt]);
  return {value:result.id===id?result.value:undefined,error:result.id===id&&result.error,retry:()=>{if(id)cache.current.delete(id);setAttempt(n=>n+1);}};
}
function CharacterPicker({catalog,selected,onChoose,onClose}:{catalog:EntitySummary[];selected:string|null;onChoose:(id:string)=>void;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null),[search,setSearch]=useState('');
  useEffect(()=>{const d=ref.current!,opener=document.activeElement;d.showModal();return()=>{d.close();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus();};},[]);
  const results=catalog.filter(c=>c.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <dialog ref={ref} className="profile_picker" aria-labelledby="profile_picker_title" onCancel={e=>{e.preventDefault();onClose();}}><header><h2 id="profile_picker_title">Choose a character</h2><button onClick={onClose}>Close picker</button></header>
    <label>Find a character<input autoFocus type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label><p role="status">{results.length} of {catalog.length} characters</p>
    <div className="profile_picker_grid">{results.map(c=><button key={c.id} data-profile-choice={c.id} aria-pressed={c.id===selected} onClick={()=>onChoose(c.id)}><Portrait id={c.id} name={c.name} variant="details"/><strong>{c.name}</strong></button>)}</div>
    {!results.length&&<p>No matching characters. <button onClick={()=>setSearch('')}>Clear search</button></p>}
  </dialog>;
}
export function CharacterProfile({planning}:{planning:PlanningController}) {
  const [catalog,setCatalog]=useState<EntitySummary[]>(),[selected,setSelected]=useState<string|null>(null),[tab,setTab]=useState<ProfileTab>('arts_abilities');
  const [initError,setInitError]=useState(false),[attempt,setAttempt]=useState(0),[picker,setPicker]=useState(false),[detail,setDetail]=useState<DetailSelection|null>(null),[birdSearch,setBirdSearch]=useState('');
  const [preferenceError,setPreferenceError]=useState(false),selectionWrites=useRef(Promise.resolve()),lastSelected=useRef<string|null>(null),content=useRef<HTMLDivElement>(null);
  useEffect(()=>{let active=true;setInitError(false);async function load(){
    const preference=window.loom.loadCharacterProfilePreference().catch(()=>{if(active)setPreferenceError(true);return null;});
    const all:EntitySummary[]=[];for(let offset=0;;){const page=await window.loom.referenceCatalog({kind:'character',offset,limit:100});all.push(...page.rows);if(page.nextOffset===null)break;offset=page.nextOffset;}
    const saved=await preference;if(active){setCatalog(all);const id=resolveProfileCharacter(all,saved?.characterId??null);setSelected(id);lastSelected.current=id;}
  }void load().catch(()=>{if(active)setInitError(true);});return()=>{active=false;};},[attempt]);
  const profile=useResource(selected,window.loom.characterProfile);
  const learning=useResource(tab==='arts_abilities'?selected:null,window.loom.characterLearning);
  const social=useResource(['liked_gifts','bird_time','supports'].includes(tab)?selected:null,window.loom.characterSocial);
  function persist(id:string){selectionWrites.current=selectionWrites.current.catch(()=>undefined).then(async()=>{try{await window.loom.saveCharacterProfilePreference({characterId:id});if(lastSelected.current===id)setPreferenceError(false);}catch{if(lastSelected.current===id)setPreferenceError(true);}});}
  function choose(id:string){if(!catalog?.some(c=>c.id===id))return;lastSelected.current=id;setSelected(id);setPicker(false);setDetail(null);setBirdSearch('');persist(id);}
  useEffect(()=>{content.current?.scrollTo(0,0);},[selected,tab]);
  function tabKeys(event:React.KeyboardEvent<HTMLButtonElement>,index:number){let next=index;if(event.key==='ArrowRight')next=(index+1)%PROFILE_TABS.length;else if(event.key==='ArrowLeft')next=(index+PROFILE_TABS.length-1)%PROFILE_TABS.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=PROFILE_TABS.length-1;else return;event.preventDefault();setTab(PROFILE_TABS[next][0]);document.getElementById(`profile_tab_${PROFILE_TABS[next][0]}`)?.focus();}
  if(initError)return <div role="alert">Character catalog could not be loaded. <button onClick={()=>setAttempt(n=>n+1)}>Retry catalog</button></div>;
  if(!catalog)return <p role="status">Opening character profiles…</p>;
  if(!selected)return <p>No characters are available in this dataset.</p>;
  const p=profile.value;
  const resource=tab==='arts_abilities'?learning:tab==='recruitment'?null:social;
  return <div className="character_profile" data-profile-character={selected} data-profile-tab={tab}>
    {preferenceError&&<div role="alert" className="profile_preference_error">Last-viewed character could not be loaded or saved. Browsing is still available. <button onClick={()=>persist(selected)}>Remember this character</button></div>}
    {p?<ProfileSummary profile={p} planning={planning} onChoose={()=>setPicker(true)} preview={DEFERRED_CLASS_PREVIEW}/>:<aside className="profile_summary"><button onClick={()=>setPicker(true)}>Choose character · {catalog.find(c=>c.id===selected)?.name}</button>{profile.error?<p role="alert">Profile could not be loaded. <button onClick={profile.retry}>Retry profile</button></p>:<p role="status">Loading character information…</p>}</aside>}
    <div className="profile_workspace"><div className="profile_tab_bar" role="tablist" aria-label="Character information">{PROFILE_TABS.map(([id,label],i)=><button key={id} role="tab" id={`profile_tab_${id}`} aria-selected={tab===id} aria-controls={`profile_panel_${id}`} tabIndex={tab===id?0:-1} onKeyDown={e=>tabKeys(e,i)} onClick={()=>setTab(id)}>{label}</button>)}</div>
      <div className="profile_tab_content" ref={content} role="tabpanel" id={`profile_panel_${tab}`} aria-labelledby={`profile_tab_${tab}`} tabIndex={0}>
        <h2 className="visually_hidden">{catalog.find(c=>c.id===selected)?.name} · {PROFILE_TABS.find(t=>t[0]===tab)?.[1]}</h2>
        {p&&(resource?.error?<div role="alert">This section could not be loaded. <button onClick={resource.retry}>Retry section</button></div>:<ProfileTabContent key={`${selected}:${tab}`} tab={tab} profile={p} learning={learning.value} social={social.value} catalog={new Set(catalog.map(c=>c.id))} onChoose={choose} onDetail={setDetail} search={birdSearch} onSearch={setBirdSearch}/>)}
      </div>
    </div>
    {picker&&<CharacterPicker catalog={catalog} selected={selected} onChoose={choose} onClose={()=>setPicker(false)}/>}
    {detail&&<FocusedDetail catalog={new Set(catalog.map(c=>c.id))} onCharacter={choose} selection={detail} onSelect={setDetail} onClose={()=>setDetail(null)}/>}
  </div>;
}
