import {useEffect,useMemo,useRef,useState} from 'react';
import {assetUrl} from '../../../shared/asset_catalog';
import {mapMatches,mapSuggestions,targetEntries,type MapLocation,type MapLocationDetail,type MapEntry,type MapSuggestion} from '../../../shared/interactive_map';
import {useMapWorkspace} from './use_map_workspace';
import {MapCanvas} from './map_canvas';
import {MapReferenceDialog,type MapDetailSelection} from './map_reference_dialog';
import {referenceIconUrl} from '../../components/images';
import './interactive_map.css';

export function InteractiveMap({active}:{active:boolean}) {
  const workspace=useMapWorkspace(active),{data,state,update}=workspace;
  const [draft,setDraft]=useState(''),[suggesting,setSuggesting]=useState(false),[detailResult,setDetail]=useState<MapLocationDetail|null>(),[detailError,setDetailError]=useState(false),[detailAttempt,setDetailAttempt]=useState(0),[popup,setPopup]=useState<MapDetailSelection>();
  const panel=useRef<HTMLElement>(null),searchRef=useRef<HTMLInputElement>(null),[suggestionIndex,setSuggestionIndex]=useState(-1);
  const suggestions=useMemo(()=>data?mapSuggestions(data,draft):[],[data,draft]);
  const detail=detailResult===null?null:detailResult?.locationId===state?.selectedLocationId&&detailResult?.contextId===state?.contextId?detailResult:undefined;
  useEffect(()=>{let live=true;setDetail(undefined);setDetailError(false);
    if(!data||!state?.selectedLocationId||state.contextId!==data.contextId)return;
    void window.loom.mapLocationDetail({locationId:state.selectedLocationId,contextId:state.contextId}).then(d=>{if(live){setDetail(d);if(panel.current)panel.current.scrollTop=0;}}).catch(()=>{if(live)setDetailError(true);});
    return()=>{live=false;};
  },[state?.selectedLocationId,state?.contextId,data?.contextId,detailAttempt]);
  if(!data||!state)return <section className="interactive_map"><h2>Map of Dagda</h2>{workspace.error?<div role="alert"><p>{workspace.error}</p><button onClick={workspace.retry}>Retry</button><button onClick={workspace.useSessionDefaults}>Open with session defaults</button></div>:<p role="status">Opening the map…</p>}</section>;
  const context=data.contexts.find(c=>c.id===state.contextId)!,matches=mapMatches(data,state.target),visible=matches.filter(l=>l.categoryIds.some(c=>state.categoryIds.includes(c)));
  const selected=data.locations.find(l=>l.id===state.selectedLocationId),entries=targetEntries(data,state.target);
  const available=data.locations.filter(l=>l.contextIds.includes(state.contextId));
  function selectLocation(location:MapLocation,center=true){
    setSuggesting(false);
    if(!location.contextIds.includes(state!.contextId)){workspace.dismissNotice();update({selectedLocationId:location.id,panel:'location'});return;}
    update({selectedLocationId:location.id,panel:'location',...(center&&location.x!==null&&location.y!==null?{center:{x:location.x,y:location.y},zoom:Math.max(3,state!.zoom)}:{})});
  }
  function choose(s:MapSuggestion){setDraft('');setSuggesting(false);setSuggestionIndex(-1);
    if(s.kind==='location'){update({target:null});selectLocation(data!.locations.find(l=>l.id===s.id)!);return;}
    update({target:{id:s.id,kind:s.kind,name:s.name},selectedLocationId:null,panel:'results'});
    if(s.kind==='region'){
      const places=data!.locations.filter(l=>l.regionId===s.id&&l.contextIds.includes(state!.contextId)&&l.x!==null&&l.y!==null);
      if(places.length){const xs=places.map(l=>l.x!),ys=places.map(l=>l.y!),span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),.08);update({center:{x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2},zoom:Math.max(1,Math.min(8,.7/span))});}
    }
  }
  function toggle(id:string){const ids=state!.categoryIds.includes(id)?state!.categoryIds.filter(c=>c!==id):[...state!.categoryIds,id];update({categoryIds:ids,...(selected&&!selected.categoryIds.some(c=>ids.includes(c))?{selectedLocationId:null,panel:'results' as const}:{})});}
  function openEntry(e:MapEntry){if(!e.targetId)return;setPopup({id:e.targetId,name:e.name,kind:e.kind==='mount_variant'||e.kind==='mount'?'mount':e.kind==='battalion'?'battalion':'item'});}
  const entryRow=(e:MapEntry)=><li key={e.id} className={state.target&&e.targetId===state.target.id?'map_entry_match':''}>{e.targetId?<button className="map_content_link" onClick={()=>openEntry(e)}>{referenceIconUrl(e.targetId)&&<img src={referenceIconUrl(e.targetId)!} alt=""/>}{e.grade&&<span className="map_grade">{e.grade}</span>}{e.name}</button>:<span>{e.name} <small>Unresolved identity</small></span>}<span className="map_entry_numbers">{e.role.startsWith('shop_')?`Stock ${e.stock??'?'} · ${e.price!==null?`${e.price} G`:e.listedPrice!==null&&e.listedPrice!==undefined?`${e.listedPrice} G (item price)`:'Price unknown'}`:e.quantity!==null?`×${e.quantity}`:''}</span>{e.condition&&<p>{e.condition}</p>}{(e.role==='gatherable'||e.probability!==null)&&<small>{e.probability===null?'Rate unknown':`${(e.probability*100).toLocaleString()}%`}</small>}</li>;
  const resultLocations=state.target?matches:available;
  return <section className="interactive_map" aria-label="Map of Dagda" data-map-context={state.contextId} aria-busy={workspace.loading}>
    <div className="map_toolbar"><div className="map_contexts" role="group" aria-label="Map story context">{data.contexts.map(c=><button key={c.id} aria-pressed={c.id===state.contextId} onClick={()=>{setDraft('');setSuggesting(false);void workspace.changeContext(c.id);}}>{c.label}</button>)}</div>
      <div className="map_search"><label htmlFor="map_search_input" className="visually_hidden">Find a location, item, mount, battalion, or region</label><input ref={searchRef} id="map_search_input" type="search" placeholder="Find a location, item, region…" value={draft} maxLength={200} role="combobox" aria-expanded={suggesting&&!!draft.trim()} aria-controls="map_suggestions" aria-autocomplete="list" aria-activedescendant={suggestionIndex>=0?`map_suggestion_${suggestionIndex}`:undefined} onFocus={()=>setSuggesting(true)} onChange={e=>{setDraft(e.target.value);setSuggesting(true);setSuggestionIndex(-1);}} onKeyDown={e=>{
        if(e.key==='Escape'){setSuggesting(false);return;}if(e.key==='ArrowDown'){e.preventDefault();setSuggesting(true);setSuggestionIndex(n=>Math.min(suggestions.length-1,n+1));}if(e.key==='ArrowUp'){e.preventDefault();setSuggestionIndex(n=>Math.max(0,n-1));}if(e.key==='Enter'&&suggestions.length){e.preventDefault();choose(suggestions[Math.max(0,suggestionIndex)]);}
      }}/>{suggesting&&!!draft.trim()&&<div className="map_suggestions" id="map_suggestions" role="listbox" aria-label="Map search results">{suggestions.length?suggestions.map((s,i)=><button id={`map_suggestion_${i}`} role="option" aria-selected={i===suggestionIndex} key={`${s.kind}:${s.id}`} onClick={()=>choose(s)}><strong>{s.name}</strong><small>{s.kind==='unresolved'?'Unresolved content':s.kind} · {s.count} {s.count===1?'place':'places'} in this view</small></button>):<p>No matching recorded locations or contents.</p>}</div>}</div>
    </div>
    {(workspace.error||workspace.saveError||workspace.sessionOnly)&&<div className="map_feedback" role="alert">{workspace.error||workspace.saveError||'Session defaults are open; automatic saving is paused to preserve the unread saved view.'} {workspace.error&&<button onClick={workspace.retry}>Retry loading</button>}{workspace.saveError&&<button onClick={workspace.retrySave}>Retry saving</button>}{workspace.sessionOnly&&<button onClick={workspace.retry}>Retry saved view</button>}</div>}
    {workspace.notice&&<div className="map_feedback" role="status">{workspace.notice}<button aria-label="Dismiss map message" onClick={workspace.dismissNotice}>×</button></div>}
    <div className="map_workspace">
      <div className="map_visual"><details className="map_filters"><summary>Categories · {state.categoryIds.length} of {data.categories.length} enabled</summary><div>{[...new Set(data.categories.map(c=>c.group))].map(group=><fieldset key={group}><legend>{group}</legend>{data.categories.filter(c=>c.group===group).map(c=><button key={c.id} aria-pressed={state.categoryIds.includes(c.id)} title={c.label} onClick={()=>toggle(c.id)}>{c.iconId&&<img src={assetUrl(c.iconId)} alt=""/>}{c.label}</button>)}</fieldset>)}<button onClick={()=>update({categoryIds:data.categories.map(c=>c.id)})}>Show All</button><button onClick={()=>update({categoryIds:[],selectedLocationId:null,panel:'results'})}>Hide All</button></div></details>
        <MapCanvas data={data} state={state} locations={visible} active={active} onChange={update} onSelect={l=>selectLocation(l,false)}/>
        {!visible.length&&<div className="map_empty">{state.categoryIds.length?'No matching markers in this view.':'All categories are hidden.'}<button onClick={()=>update({categoryIds:data.categories.map(c=>c.id),target:null})}>Show all locations</button></div>}
      </div>
      <aside className="map_panel" ref={panel} aria-label="Map location and search details" aria-live="polite">
        <p className="eyebrow">{context.label}{context.part===3?' · Route scope unspecified':''}</p>
        {state.panel==='location'&&selected?<>
          <div className="map_panel_heading"><div><h2>{selected.name}</h2><p>{selected.regionName??'Region unknown'} · {selected.categoryIds.map(id=>data.categories.find(c=>c.id===id)?.label).filter(Boolean).join(', ')||'Category unknown'}</p></div><button aria-label="Clear location selection" onClick={()=>update({selectedLocationId:null,panel:'results'})}>×</button></div>
          {state.target&&<button onClick={()=>update({panel:'results'})}>← Back to {state.target.name} results</button>}
          {!selected.contextIds.includes(state.contextId)?<p>Not listed in this view.</p>:<>
            {!selected.categoryIds.some(id=>state.categoryIds.includes(id))&&<p className="warning">This location’s category is hidden. <button onClick={()=>update({categoryIds:[...new Set([...state.categoryIds,...selected.categoryIds])]})}>Show this category</button></p>}
            {selected.x===null&&<p>Map position unknown.</p>}
            {detailError?<p role="alert">Location details could not be loaded. <button onClick={()=>setDetailAttempt(n=>n+1)}>Retry</button></p>:detail===undefined?<p role="status">Loading location details…</p>:detail===null?<p>Details not documented in this view.</p>:<>
              {detail.description&&<p>{detail.description}</p>}{detail.level&&<p>Reported level: {detail.level}</p>}{detail.discovery&&<p>{detail.discovery}</p>}
              {[...new Set(detail.entries.map(e=>e.group))].map(group=><section className="map_content_group" key={group}><h3>{group}</h3><ul>{detail.entries.filter(e=>e.group===group).map(entryRow)}</ul></section>)}
              {!detail.entries.length&&<p>Location contents not documented in this view.</p>}
              {detail.shopNotes.map((n,i)=><p className="hint" key={i}>{n.name}: {n.text}</p>)}
            </>}
          </>}
          <section className="map_other_contexts"><h3>Listed in</h3>{data.contexts.filter(c=>selected.contextIds.includes(c.id)).map(c=><button key={c.id} disabled={c.id===state.contextId} onClick={()=>{void workspace.changeContext(c.id);}}>{c.label}</button>)}</section>
        </>:<>
          <h2>{state.target?.name??'Map of Dagda'}</h2><p>{state.target?`${resultLocations.length} documented ${resultLocations.length===1?'location':'locations'} · ${visible.length} shown on map`:'Explore a location, or search for something you want to find.'}</p>
          {!state.target&&<p className="hint">Drag to pan · Scroll to zoom · Click a marker for details</p>}
          {state.target&&state.target.kind!=='region'&&state.target.kind!=='unresolved'&&<button onClick={()=>setPopup({id:state.target!.id,name:state.target!.name,kind:state.target!.kind==='mount'?'mount':state.target!.kind==='battalion'?'battalion':'item'})}>View {state.target.kind} details</button>}
          <h3>{state.target?'Found at':'Locations'} <small>({resultLocations.length})</small></h3>
          {!resultLocations.length&&<p>No locations are documented for this search in the selected view.</p>}
          <ul className="map_location_list">{resultLocations.map(l=><li key={l.id}><button onClick={()=>selectLocation(l)}><strong>{l.name}</strong><small>{l.regionName??'Region unknown'}{l.x===null?' · Map position unknown':''}{!l.categoryIds.some(c=>state.categoryIds.includes(c))?' · Category hidden':''}</small></button>{state.target&&state.target.kind!=='region'&&<small>{[...new Set(entries.filter(e=>e.locationId===l.id).map(e=>`${e.group}${e.condition?` · ${e.condition}`:''}`))].join('; ')}</small>}</li>)}</ul>
        </>}
      </aside>
    </div>
    <div className="map_footer"><span role="status">{visible.length} / {available.length} locations shown{workspace.loading?' · Loading view…':''}</span><div className="button_row"><button onClick={()=>{setDraft('');setSuggesting(false);update({target:null});}}>Clear Search</button><button onClick={()=>update({categoryIds:data.categories.map(c=>c.id)})}>Reset Filters</button><button onClick={()=>update({center:{x:.5,y:.5},zoom:1})}>Reset Map View</button><button title="Reset this map’s context, filters, search, selection, and viewport to defaults" onClick={()=>{setDraft('');setSuggesting(false);workspace.resetAll();}}>Reset All Map</button></div></div>
    {popup&&<MapReferenceDialog key={`${popup.kind}:${popup.id}`} selection={popup} onClose={()=>setPopup(undefined)}/>}
  </section>;
}
