import { z } from 'zod';
import { referenceIdSchema, type EntitySummary, type MapSurfaceReference, type ReferenceScope } from './reference_details';

const id=referenceIdSchema;
export const mapTargetSchema=z.object({id,kind:z.enum(['region','item','mount','battalion','unresolved']),name:z.string().min(1).max(300)}).strict();
export type MapTarget=z.infer<typeof mapTargetSchema>;
export const mapPreferenceSchema=z.object({
  version:z.literal(1),surfaceId:id,contextId:id,
  center:z.object({x:z.number().finite().min(0).max(1),y:z.number().finite().min(0).max(1)}).strict(),
  zoom:z.number().finite().min(1).max(16),categoryIds:z.array(id).max(100),knownCategoryIds:z.array(id).max(100),
  selectedLocationId:id.nullable(),target:mapTargetSchema.nullable(),panel:z.enum(['location','results']),
}).strict().refine(p=>new Set(p.categoryIds).size===p.categoryIds.length&&new Set(p.knownCategoryIds).size===p.knownCategoryIds.length,'Duplicate map category');
export type MapPreference=z.infer<typeof mapPreferenceSchema>;
export interface MapContext {id:string;label:string;part:number;routeId:string|null;routeScope:string}
export interface MapLocation {id:string;markerId:string;name:string;aliases:string[];regionId:string|null;regionName:string|null;x:number|null;y:number|null;contextIds:string[];categoryIds:string[]}
export interface MapEntry {
  id:string;locationId:string;targetId:string|null;kind:string;name:string;aliases:string[];role:string;group:string;
  quantity:string|null;stock:string|null;price:string|null;condition:string|null;probability:number|null;
  listedPrice?:string|null;grade?:string|null;
}
export interface MapOverview {
  surface:MapSurfaceReference;contexts:MapContext[];contextId:string;
  categories:{id:string;label:string;group:string;iconId:string|null}[];
  locations:MapLocation[];entries:MapEntry[];targets:{id:string;kind:string;name:string;aliases:string[]}[];
}
export interface MapLocationDetail {
  locationId:string;contextId:string;description:string|null;discovery:string|null;level:string|null;entries:MapEntry[];
  shopNotes:{name:string;text:string}[];
}
export interface MapEntityDetail extends ReferenceScope {
  entity:EntitySummary;facts:{label:string;value:string}[];
  stats:{label:string;values:{label:string;value:string}[]}[];
  actions:{id:string;name:string;label:string}[];
}
export const mapLocationRequestSchema=z.object({locationId:id,contextId:id}).strict();
export const mapEntityRequestSchema=z.object({id,kind:z.enum(['mount','battalion'])}).strict();
export function mapPosition(sourceX:number|null,sourceY:number|null,spatial:MapSurfaceReference['spatial']):{x:number;y:number}|null {
  if(sourceX===null||sourceY===null||!spatial.unitsX||!spatial.unitsY)return null;
  const x=sourceX/spatial.unitsX,y=sourceY/spatial.unitsY;
  return {x,y:spatial.flipY?1-y:y};
}
export function defaultMapPreference(data:MapOverview):MapPreference {
  const ids=data.categories.map(c=>c.id);
  return {version:1,surfaceId:data.surface.surface.id,contextId:data.contextId,center:{x:.5,y:.5},zoom:1,categoryIds:ids,knownCategoryIds:ids,selectedLocationId:null,target:null,panel:'results'};
}
export function normalizeMapPreference(saved:MapPreference|null,data:MapOverview):{value:MapPreference;repaired:boolean} {
  const fallback=defaultMapPreference(data);if(!saved)return {value:fallback,repaired:false};
  const all=new Set(fallback.categoryIds),known=new Set(saved.knownCategoryIds);
  const categoryIds=[...saved.categoryIds.filter(id=>all.has(id)),...fallback.categoryIds.filter(id=>!known.has(id))];
  const contextId=data.contexts.some(c=>c.id===saved.contextId)?saved.contextId:data.contexts[0].id;
  const location=data.locations.find(l=>l.id===saved.selectedLocationId&&l.contextIds.includes(contextId)&&l.categoryIds.some(c=>categoryIds.includes(c)));
  const target=saved.target&&(saved.target.kind==='region'?data.locations.some(l=>l.regionId===saved.target!.id):saved.target.kind==='unresolved'?data.entries.some(e=>e.targetId===null&&e.name===saved.target!.name):data.targets.some(e=>e.id===saved.target!.id))?saved.target:null;
  const value:MapPreference={...saved,contextId,categoryIds,knownCategoryIds:fallback.knownCategoryIds,selectedLocationId:location?.id??null,target,panel:location?saved.panel:'results',...(saved.surfaceId!==fallback.surfaceId?{surfaceId:fallback.surfaceId,center:fallback.center,zoom:1}:{})};
  return {value,repaired:JSON.stringify(value)!==JSON.stringify(saved)};
}
export function targetEntries(data:MapOverview,target:MapTarget|null):MapEntry[] {
  if(!target||target.kind==='region')return [];
  return data.entries.filter(e=>target.kind==='unresolved'?e.targetId===null&&e.name===target.name:e.targetId===target.id);
}
export function mapMatches(data:MapOverview,target:MapTarget|null):MapLocation[] {
  const ids=new Set(targetEntries(data,target).map(e=>e.locationId));
  return data.locations.filter(l=>l.contextIds.includes(data.contextId)&&(!target||(target.kind==='region'?l.regionId===target.id:ids.has(l.id))));
}
export interface MapSuggestion {id:string;kind:'location'|MapTarget['kind'];name:string;count:number}
export function mapSuggestions(data:MapOverview,search:string):MapSuggestion[] {
  const q=search.trim().toLocaleLowerCase('en');if(!q)return [];
  const matches=(name:string,aliases:string[]=[])=>[name,...aliases].some(n=>n.toLocaleLowerCase('en').includes(q));
  const found=new Map<string,MapSuggestion>();
  for(const l of data.locations){
    if(matches(l.name,l.aliases))found.set(l.id,{id:l.id,kind:'location',name:l.name,count:l.contextIds.includes(data.contextId)?1:0});
    if(l.regionId&&l.regionName&&matches(l.regionName))found.set(l.regionId,{id:l.regionId,kind:'region',name:l.regionName,count:data.locations.filter(a=>a.regionId===l.regionId&&a.contextIds.includes(data.contextId)).length});
  }
  for(const e of data.targets)if(matches(e.name,e.aliases)) {
    const kind:MapTarget['kind']=e.kind==='mount_variant'||e.kind==='mount'?'mount':e.kind==='battalion'?'battalion':'item';
    found.set(e.id,{id:e.id,kind,name:e.name,count:new Set(data.entries.filter(a=>a.targetId===e.id).map(a=>a.locationId)).size});
  }
  for(const e of data.entries)if(e.targetId===null&&matches(e.name))found.set(`unresolved:${e.name}`,{id:e.id,kind:'unresolved',name:e.name,count:new Set(data.entries.filter(a=>a.targetId===null&&a.name===e.name).map(a=>a.locationId)).size});
  return [...found.values()].sort((a,b)=>Number(b.name.toLocaleLowerCase('en')===q)-Number(a.name.toLocaleLowerCase('en')===q)||a.name.localeCompare(b.name,'en')||a.kind.localeCompare(b.kind)).slice(0,80);
}
export function zoomAt(center:{x:number;y:number},zoom:number,nextZoom:number,pointer:{x:number;y:number},size:{width:number;height:number},fit:number) {
  const next=Math.max(1,Math.min(16,nextZoom)),scale=fit*zoom,nextScale=fit*next;
  return {zoom:next,center:{x:Math.max(0,Math.min(1,center.x+(pointer.x-size.width/2)*(1/scale-1/nextScale))),y:Math.max(0,Math.min(1,center.y+(pointer.y-size.height/2)*(1/scale-1/nextScale)))}};
}
