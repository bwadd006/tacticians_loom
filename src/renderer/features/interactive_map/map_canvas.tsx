import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {assetUrl} from '../../../shared/asset_catalog';
import {zoomAt,type MapOverview,type MapPreference,type MapLocation} from '../../../shared/interactive_map';

export function MapCanvas({data,state,locations,active,onChange,onSelect}:{data:MapOverview;state:MapPreference;locations:MapLocation[];active:boolean;onChange:(p:Partial<MapPreference>)=>void;onSelect:(l:MapLocation)=>void}) {
  const frame=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;center:{x:number;y:number};moved:boolean}|undefined>(undefined);
  const suppressClick=useRef(false);
  const [size,setSize]=useState({width:800,height:600}),[failed,setFailed]=useState(false);
  const fit=Math.min(size.width,size.height),pixels=fit*state.zoom,left=size.width/2-state.center.x*pixels,top=size.height/2-state.center.y*pixels;
  const current=useRef({state,size,fit,onChange});current.current={state,size,fit,onChange};
  useLayoutEffect(()=>{
    if(!active||!frame.current)return;
    const measure=()=>{const r=frame.current?.getBoundingClientRect();if(r?.width&&r.height)setSize(previous=>previous.width===r.width&&previous.height===r.height?previous:{width:r.width,height:r.height});};
    measure();const observer=new ResizeObserver(measure);observer.observe(frame.current);window.addEventListener('resize',measure);
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[active]);
  useEffect(()=>{const node=frame.current!;const wheel=(event:WheelEvent)=>{
    if(!active)return;event.preventDefault();const {state,size,fit,onChange}=current.current,r=node.getBoundingClientRect();
    onChange(zoomAt(state.center,state.zoom,state.zoom*Math.exp(-event.deltaY*.0015),{x:event.clientX-r.left,y:event.clientY-r.top},size,fit));
  };node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);},[active]);
  const sourceWidth=data.surface.spatial.width??4948,tileSize=data.surface.tileSize??512;
  const level=Math.max(0,Math.min(4,Math.floor(Math.log2(sourceWidth/pixels))));
  const tiles=data.surface.tiles.filter(t=>t.body.level===level).filter(t=>{
    const b=t.body,stride=tileSize*2**level/sourceWidth,x=left+b.tile_x*stride*pixels,y=top+b.tile_y*stride*pixels;
    return x<size.width&&y<size.height&&x+stride*pixels>0&&y+stride*pixels>0;
  });
  function zoom(multiplier:number){onChange(zoomAt(state.center,state.zoom,state.zoom*multiplier,{x:size.width/2,y:size.height/2},size,fit));}
  return <div className="map_canvas" ref={frame} tabIndex={0} aria-label="Interactive map. Arrow keys pan; plus and minus zoom; Home fits the map." onKeyDown={e=>{
    if(e.target!==e.currentTarget)return;
    const delta=.12/state.zoom;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();onChange({center:{x:Math.max(0,Math.min(1,state.center.x+(e.key==='ArrowLeft'?-delta:e.key==='ArrowRight'?delta:0))),y:Math.max(0,Math.min(1,state.center.y+(e.key==='ArrowUp'?-delta:e.key==='ArrowDown'?delta:0)))}});}
    if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1.4);}if(e.key==='-'){e.preventDefault();zoom(1/1.4);}if(e.key==='Home'){e.preventDefault();onChange({center:{x:.5,y:.5},zoom:1});}
  }} onPointerDown={e=>{
    const target=e.target as HTMLElement;if(e.button!==0||(target.closest('button')&&!target.closest('.map_marker')))return;
    suppressClick.current=false;drag.current={x:e.clientX,y:e.clientY,center:state.center,moved:false};if(!target.closest('.map_marker'))e.currentTarget.setPointerCapture(e.pointerId);
  }} onPointerMove={e=>{const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>4){d.moved=true;e.currentTarget.setPointerCapture(e.pointerId);}if(d.moved)onChange({center:{x:Math.max(0,Math.min(1,d.center.x-dx/pixels)),y:Math.max(0,Math.min(1,d.center.y-dy/pixels))}});
  }} onPointerUp={()=>{suppressClick.current=drag.current?.moved??false;drag.current=undefined;}} onPointerCancel={()=>{drag.current=undefined;suppressClick.current=false;}}>
    <div className="map_image_plane" style={{width:pixels,height:pixels,left,top}} aria-hidden="true">
      {data.surface.backgroundAssetId&&<img className="map_background" draggable={false} src={assetUrl(data.surface.backgroundAssetId)} alt="" onError={()=>setFailed(true)}/>}
      {tiles.map(t=>{const b=t.body,stride=tileSize*2**level/sourceWidth;return b.asset_id&&<img key={t.id} className="map_tile" draggable={false} src={assetUrl(b.asset_id)} alt="" style={{left:`${b.tile_x*stride*100}%`,top:`${b.tile_y*stride*100}%`,width:`${Math.min(stride,1-b.tile_x*stride)*100}%`,height:`${Math.min(stride,1-b.tile_y*stride)*100}%`}} onError={e=>{e.currentTarget.style.visibility='hidden';}}/>;})}
    </div>
    {locations.filter(l=>l.x!==null&&l.y!==null).map(l=>{
      const category=data.categories.find(c=>c.id===l.categoryIds[0]);
      // Keep the artwork and hit area in map-image units so they grow together
      // with the baked tile symbols, including the larger location categories.
      const categoryScale=category?.label==='Base'?1.65:category?.label==='Settlement'?1.35:category?.label==='Temple'?1.2:1;
      const diameter=80*categoryScale*pixels/sourceWidth;
      const x=left+l.x!*pixels,y=top+l.y!*pixels,radius=diameter/2;
      if(x+radius<0||y+radius<0||x-radius>size.width||y-radius>size.height)return null;
      return <button key={l.id} type="button" data-map-marker={l.id} className={`map_marker${state.selectedLocationId===l.id?' selected':''}${state.target?' matched':''}`} style={{left:x,top:y,width:diameter,height:diameter}} title={`${l.name} · ${category?.label??'Location'}`} aria-label={`${l.name} · ${category?.label??'Location'}`} aria-pressed={state.selectedLocationId===l.id} onClick={e=>{if(!suppressClick.current||e.detail===0)onSelect(l);}}>{category?.iconId?<img draggable={false} src={assetUrl(category.iconId)} alt="" onError={e=>{e.currentTarget.style.display='none';e.currentTarget.parentElement!.classList.add('map_marker_fallback');}}/>:<span>◆</span>}</button>;
    })}
    <div className="map_zoom_controls"><button title="Zoom in" aria-label="Zoom in" onClick={()=>zoom(1.4)}>+</button><button title="Zoom out" aria-label="Zoom out" onClick={()=>zoom(1/1.4)}>−</button><button title="Fit the whole map" onClick={()=>onChange({center:{x:.5,y:.5},zoom:1})}>Fit</button></div>
    <span className="map_scale">{Math.round(state.zoom*100)}%</span>
    {failed&&<p className="map_image_error" role="status">Background unavailable. Showing available local map tiles.</p>}
  </div>;
}
