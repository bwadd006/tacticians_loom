import {useCallback,useEffect,useRef,useState} from 'react';
import {defaultMapPreference,normalizeMapPreference,type MapOverview,type MapPreference} from '../../../shared/interactive_map';

export function useMapWorkspace(active:boolean) {
  const [data,setData]=useState<MapOverview>(),[state,setState]=useState<MapPreference>(),[loading,setLoading]=useState(true);
  const [error,setError]=useState(''),[saveError,setSaveError]=useState(''),[notice,setNotice]=useState('');
  const [attempt,setAttempt]=useState(0),[sessionOnly,setSessionOnly]=useState(false),session=useRef(true),useDefaults=useRef(false);
  const latest=useRef<MapPreference|undefined>(undefined),saved=useRef(''),enqueued=useRef<string|null>(null),queue=useRef(Promise.resolve()),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),request=useRef(0),allowClose=useRef(false);
  const flush=useCallback(()=>{
    clearTimeout(timer.current);const value=latest.current;if(!value||session.current||JSON.stringify(value)===enqueued.current)return queue.current;
    const serialized=JSON.stringify(value);
    enqueued.current=serialized;
    const task=queue.current.catch(()=>{}).then(async()=>{await window.loom.saveMapPreference(value);saved.current=serialized;setSaveError('');});
    queue.current=task;void task.catch(()=>{if(enqueued.current===serialized)enqueued.current=null;setSaveError('Map view could not be saved. Your current session is still available.');});
    return task;
  },[]);
  useEffect(()=>{let live=true;setLoading(true);setError('');
    (async()=>{
      const preference=useDefaults.current?null:await window.loom.loadMapPreference();
      let initial=await window.loom.mapOverview();
      if(preference&&initial.contexts.some(c=>c.id===preference.contextId)&&preference.contextId!==initial.contextId)initial=await window.loom.mapOverview(preference.contextId);
      if(!live)return;
      const normalized=normalizeMapPreference(preference,initial);
      saved.current=preference?JSON.stringify(preference):JSON.stringify(normalized.value);
      enqueued.current=saved.current;
      session.current=useDefaults.current;setSessionOnly(useDefaults.current);
      latest.current=normalized.value;setState(normalized.value);setData(initial);setLoading(false);
      if(normalized.repaired)setNotice('Some saved map choices are no longer listed; the view was adjusted.');
    })().catch(()=>{if(live){session.current=true;setSessionOnly(true);setError('Map data or its saved view could not be loaded.');setLoading(false);}});
    return()=>{live=false;};
  },[attempt]);
  const update=useCallback((change:Partial<MapPreference>|((s:MapPreference)=>MapPreference))=>{
    const current=latest.current;if(!current)return;
    const next=typeof change==='function'?change(current):{...current,...change};
    latest.current=next;setState(next);
  },[]);
  useEffect(()=>{if(!state||loading||sessionOnly)return;timer.current=setTimeout(()=>{void flush().catch(()=>{});},250);return()=>clearTimeout(timer.current);},[state,loading,sessionOnly,flush]);
  useEffect(()=>{if(!active)void flush().catch(()=>{});},[active,flush]);
  useEffect(()=>{
    const unload=(event:BeforeUnloadEvent)=>{
      if(allowClose.current||session.current||!latest.current||(JSON.stringify(latest.current)===saved.current&&enqueued.current===saved.current))return;
      event.preventDefault();event.returnValue=false as unknown as string;
      void flush().then(()=>{allowClose.current=true;window.close();}).catch(()=>{});
    };
    window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);
  },[flush,sessionOnly]);
  async function changeContext(id:string){
    if(!state||id===state.contextId)return;const n=++request.current;setLoading(true);setError('');
    try{const next=await window.loom.mapOverview(id);if(n!==request.current)return;
      const current=latest.current!,location=next.locations.find(l=>l.id===current.selectedLocationId&&l.contextIds.includes(id)&&l.categoryIds.some(c=>current.categoryIds.includes(c)));
      if(current.selectedLocationId&&!location)setNotice('That location is not listed in the selected view.');
      update({...current,contextId:id,selectedLocationId:location?.id??null,panel:location?current.panel:'results'});setData(next);
    }catch{if(n===request.current)setError('The selected map view could not be loaded. Try selecting it again.');}
    finally{if(n===request.current)setLoading(false);}
  }
  function resetAll(){if(!data)return;const n=++request.current;void (async()=>{const first=await window.loom.mapOverview();if(n!==request.current)return;useDefaults.current=false;session.current=false;enqueued.current=null;setSessionOnly(false);setError('');setLoading(false);setData(first);update(defaultMapPreference(first));setNotice('Map view reset.');})().catch(()=>setError('Map defaults could not be loaded.'));}
  return {data,state,loading,error,saveError,notice,sessionOnly,update,changeContext,resetAll,retry:()=>{useDefaults.current=false;session.current=true;setSessionOnly(true);setAttempt(n=>n+1);},retrySave:()=>{void flush().catch(()=>{});},useSessionDefaults:()=>{useDefaults.current=true;session.current=true;setSessionOnly(true);setAttempt(n=>n+1);},dismissNotice:()=>setNotice('')};
}
