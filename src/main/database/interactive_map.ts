import type Database from 'better-sqlite3';
import { referenceIdSchema,detailRecordSchemas } from '../../shared/reference_details';
import { mapLocationRequestSchema,mapEntityRequestSchema,mapPosition,type MapContext,type MapOverview,type MapEntry,type MapLocationDetail,type MapEntityDetail } from '../../shared/interactive_map';
import { factText,conditionText,statObservationText } from '../../shared/character_profile_query';
import { facts,query,entity,scope,mapSurfaceReference,referenceCatalog,locationReference } from './reference_details';
import type { Quantity } from '../../shared/reference_v3';

const cache=new WeakMap<Database.Database,Map<string,MapOverview>>();
const labels:Record<string,string>={gatherable:'Gatherables',reported_chest_content:'Chests',capturable_mount:'Capturable mounts',farm_option:'Farm options',shop_item_listing:'Shop items',shop_weapon_listing:'Weapons / Magic',battalion_listing:'Battalions'};
function quantity(q:Quantity):string|null {
  if(q.state!=='value')return null;
  if(q.qualifier==='unlimited')return 'Unlimited';
  if(q.raw!==null)return String(q.raw);
  if(q.number!==null)return String(q.number);
  return q.lower!==null&&q.upper!==null?`${q.lower}–${q.upper}`:null;
}
function contexts(db:Database.Database):MapContext[] {
  const names=['Map tab Cai','Map tab Dietrich','Map tab Theodora','Map tab Leda','Map tab Part 3'];
  return names.map(name=>{
    const c=query(db,'SELECT c.*,cr.route_id FROM contexts c LEFT JOIN context_routes cr ON cr.context_id=c.id WHERE c.label=?',name)[0];
    if(!c)throw new Error('Map story context is missing');
    return {id:c.id,label:c.part===3?'Part III':`Part I · ${name.slice(8)}`,part:c.part,routeId:c.route_id??null,routeScope:c.route_scope};
  });
}
export function mapOverview(db:Database.Database,input:unknown):MapOverview {
  const views=contexts(db),contextId=input===undefined?views[0].id:referenceIdSchema.parse(input);
  if(!views.some(c=>c.id===contextId))throw new Error('Unsupported map context');
  let stored=cache.get(db);if(!stored){stored=new Map();cache.set(db,stored);}const hit=stored.get(contextId);if(hit)return hit;
  const surfaceId=referenceCatalog(db,{kind:'map_surface',limit:1}).rows[0]?.id;
  const surface=surfaceId?mapSurfaceReference(db,surfaceId):null;if(!surface)throw new Error('Map surface is missing');
  const aliases=new Map<string,string[]>();for(const a of query(db,'SELECT entity_id,alias FROM entity_aliases'))aliases.set(a.entity_id,[...(aliases.get(a.entity_id)??[]),a.alias]);
  const categories=surface.categories.map(c=>({...c,iconId:query(db,"SELECT b.resource_id FROM asset_bindings b WHERE b.subject_entity_id=? AND b.role='map_category_pin' AND json_extract(b.variant_json,'$.mode')='normal'",c.id)[0]?.resource_id??null}));
  const markerContexts=query(db,'SELECT * FROM marker_contexts'),markerCategories=query(db,'SELECT * FROM marker_categories WHERE context_id=? ORDER BY source_order',contextId);
  const locations=query(db,`SELECT e.id,e.display_name,l.region_id,r.display_name region_name,m.record_id marker_id,m.source_x,m.source_y
    FROM locations l JOIN entities e ON e.id=l.id LEFT JOIN entities r ON r.id=l.region_id JOIN map_markers m ON m.location_id=l.id WHERE m.surface_id=? AND e.retired=0 ORDER BY e.display_name COLLATE NOCASE`,surfaceId).map(l=>{
    const position=mapPosition(l.source_x,l.source_y,surface.spatial);
    return {id:l.id,markerId:l.marker_id,name:l.display_name,aliases:aliases.get(l.id)??[],regionId:l.region_id,regionName:l.region_name,x:position?.x??null,y:position?.y??null,contextIds:markerContexts.filter(c=>c.marker_id===l.marker_id).map(c=>c.context_id),categoryIds:markerCategories.filter(c=>c.marker_id===l.marker_id).map(c=>c.category_id)};
  });
  const view=views.find(c=>c.id===contextId)!;
  const contents=facts(db,'location_contents',`r.context_id=? OR r.context_id IN (SELECT c.id FROM contexts c WHERE c.part=? AND ${view.part===3?"c.route_scope='unknown'":"EXISTS(SELECT 1 FROM context_routes cr WHERE cr.context_id=c.id AND cr.route_id=?)"})`,contextId,view.part,...(view.part===3?[]:[view.routeId]));
  const layers=facts(db,'inventory_layers'),offers=facts(db,'shop_offers');
  const shops=query(db,'SELECT s.id,s.location_id,e.display_name FROM shops s JOIN entities e ON e.id=s.id');
  const targetIds=[...new Set([...contents.map(c=>c.body.target_id),...offers.map(o=>o.body.target_id)].filter((id):id is string=>!!id))];
  const targets=new Map(query(db,"SELECT id,display_name,kind FROM entities WHERE retired=0").filter(e=>targetIds.includes(e.id)).map(e=>[e.id,e]));
  const allScope=scope(db,[...contents,...offers]);
  const itemPrices=new Map<string,Set<string>>();
  for(const p of facts(db,'item_profiles','r.context_id IS NULL')) {
    const price=p.body.parameters_json.price;
    if(price?.state==='value'&&price.value&&typeof price.value==='object'&&price.value.unit==='gold') {
      const value=quantity(price.value);if(value!==null){const prices=itemPrices.get(p.body.item_id)??new Set<string>();prices.add(value);itemPrices.set(p.body.item_id,prices);}
    }
  }
  const grades=new Map(facts(db,'battalion_profiles').map(p=>[p.body.battalion_id,p.body.grade_id.state==='value'?p.body.grade_id.value:null]));
  const entries:MapEntry[]=[];
  const add=(e:MapEntry)=>{if(!entries.some(a=>a.locationId===e.locationId&&a.targetId===e.targetId&&a.name===e.name&&a.group===e.group&&a.role===e.role&&a.condition===e.condition))entries.push(e);};
  const selectedLayers=new Map<string,typeof layers>();
  for(const shop of shops){const local=layers.filter(l=>l.body.shop_id===shop.id),specific=local.filter(l=>l.context_id===contextId);selectedLayers.set(shop.id,specific.length?specific:local.filter(l=>l.context_id===null&&l.body.inheritance_mode==='base'));}
  for(const content of contents){
    const b=content.body,target=b.target_id?targets.get(b.target_id):null;
    if(!locations.some(l=>l.id===b.location_id&&l.contextIds.includes(contextId)))continue;
    const shopRole=b.content_role==='shop_item_listing'||b.content_role==='shop_weapon_listing';
    const localShops=shops.filter(s=>s.location_id===b.location_id);
    const specific=localShops.flatMap(s=>(selectedLayers.get(s.id)??[]).filter(l=>l.context_id===contextId));
    const matches=shopRole?localShops.flatMap(s=>offers.filter(o=>(selectedLayers.get(s.id)??[]).some(l=>l.id===o.body.layer_id)&&(b.target_id?o.body.target_id===b.target_id:o.body.label===b.label)).map(o=>({shop:s,offer:o}))):[];
    // A context-specific replacement is authoritative for its shop category.
    if(shopRole&&!matches.length&&specific.some(l=>l.body.inheritance_mode==='replace'&&(b.content_role==='shop_weapon_listing'?shops.find(s=>s.id===l.body.shop_id)?.display_name.includes('Armory'):!shops.find(s=>s.id===l.body.shop_id)?.display_name.includes('Armory'))))continue;
    const base:MapEntry={id:content.id,locationId:b.location_id,targetId:b.target_id,kind:target?.kind??'unresolved',name:target?.display_name??b.label,aliases:b.target_id?aliases.get(b.target_id)??[]:[],role:b.content_role,group:labels[b.content_role]??b.content_role,quantity:quantity(b.quantity_json),stock:null,price:null,condition:conditionText(allScope,b.condition_id)||null,probability:null};
    if(matches.length)for(const {shop,offer}of matches)add({...base,id:`${content.id}:${offer.id}`,group:shop.display_name.split(' / ').slice(1).join(' / ')||shop.display_name,stock:quantity(offer.body.stock_json),price:quantity(offer.body.price_json),condition:[base.condition,conditionText(allScope,offer.body.condition_id)].filter(Boolean).join(' · ')||null});else add(base);
  }
  // Specific source inventories can include offers absent from the generic list.
  for(const shop of shops)if(locations.some(l=>l.id===shop.location_id&&l.contextIds.includes(contextId)))for(const layer of selectedLayers.get(shop.id)??[])if(layer.context_id===contextId)for(const offer of offers.filter(o=>o.body.layer_id===layer.id)) {
    const b=offer.body,t=b.target_id?targets.get(b.target_id):null;
    add({id:offer.id,locationId:shop.location_id,targetId:b.target_id,kind:t?.kind??'unresolved',name:t?.display_name??b.label,aliases:b.target_id?aliases.get(b.target_id)??[]:[],role:shop.display_name.includes('Armory')?'shop_weapon_listing':'shop_item_listing',group:shop.display_name.split(' / ').slice(1).join(' / ')||shop.display_name,quantity:null,stock:quantity(b.stock_json),price:quantity(b.price_json),condition:conditionText(allScope,b.condition_id)||null,probability:null});
  }
  const acquisitions=facts(db,'acquisition_sources','f.location_id IS NOT NULL');
  const acquisitionScope=scope(db,acquisitions);
  const suppressed=query(db,"SELECT * FROM acquisition_overrides WHERE suppression_state='source_flag_1'");
  for(const a of acquisitions){const b=a.body,c=acquisitionScope.contexts.find(c=>c.id===a.context_id);
    if(c&&(c.part!==view.part||(view.part===1&&c.route_scope!=='all'&&!c.route_ids.includes(view.routeId as 'cai'))))continue;
    // Unscoped references do not establish route/part availability; only enrich an explicit listing.
    const existing=entries.filter(e=>e.locationId===b.location_id&&e.targetId===b.target_id);
    if(existing.length){for(const e of existing)if(c&&b.probability_value.state==='value')e.probability=b.probability_value.value;continue;}
    if(!c||c.part!==view.part||(view.part===1&&!c.route_ids.includes(view.routeId as 'cai'))||!locations.some(l=>l.id===b.location_id&&l.contextIds.includes(contextId)))continue;
    if(suppressed.some(s=>s.target_id===b.target_id&&s.location_id===b.location_id))continue;
    const target=b.target_id?entity(db,b.target_id):null;
    add({id:a.id,locationId:b.location_id!,targetId:b.target_id,kind:target?.kind??'unresolved',name:target?.name??b.label,aliases:b.target_id?aliases.get(b.target_id)??[]:[],role:b.acquisition_kind,group:'Other documented sources',quantity:null,stock:null,price:null,condition:[factText(b.source_detail),conditionText(acquisitionScope,b.condition_id)].filter(Boolean).join(' · '),probability:b.probability_value.state==='value'?b.probability_value.value:null});
  }
  for(const entry of entries)if(entry.targetId){const prices=itemPrices.get(entry.targetId);entry.listedPrice=prices?.size===1?[...prices][0]:null;entry.grade=grades.get(entry.targetId)??null;}
  entries.sort((a,b)=>a.group.localeCompare(b.group)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  const searchable=query(db,`SELECT DISTINCT e.id,e.kind,e.display_name FROM entities e WHERE e.retired=0 AND e.id IN (SELECT target_id FROM location_contents UNION SELECT target_id FROM shop_offers UNION SELECT target_id FROM acquisition_sources WHERE location_id IS NOT NULL) ORDER BY e.display_name`).map(e=>({id:e.id,kind:e.kind,name:e.display_name,aliases:aliases.get(e.id)??[]}));
  const result={surface,contexts:views,contextId,categories,locations,entries,targets:searchable};stored.set(contextId,result);return result;
}

export function mapLocationDetail(db:Database.Database,input:unknown):MapLocationDetail|null {
  const r=mapLocationRequestSchema.parse(input),data=mapOverview(db,r.contextId),location=data.locations.find(l=>l.id===r.locationId&&l.contextIds.includes(r.contextId));
  if(!location)return null;
  const detail=locationReference(db,r)!;
  const profile=detail.profiles[0]?.body,context=detail.locationContexts[0]?.body;
  const text=(f:{state:string;value:unknown}|undefined)=>f?.state==='value'?String(f.value):null;
  const shopNotes=detail.shops.flatMap(s=>s.layers.flatMap(l=>{
    const note=text(l.body.note_text)??(l.body.collection_state==='not_listed_in_replacement'?'Stock not listed in this story replacement.':null);
    return note?[{name:s.entity.name.split(' / ').slice(1).join(' / '),text:note}]:[];
  }));
  return {locationId:r.locationId,contextId:r.contextId,description:text(context?.description_text)??text(profile?.description_text),discovery:text(profile?.discovery_text),level:text(context?.recommended_level_text),entries:data.entries.filter(e=>e.locationId===r.locationId),shopNotes};
}

export function mapEntityDetail(db:Database.Database,input:unknown):MapEntityDetail|null {
  const r=mapEntityRequestSchema.parse(input),e=entity(db,r.id);if(!e||!query(db,`SELECT id FROM ${r.kind==='mount'?'mounts':'battalions'} WHERE id=?`,r.id).length)return null;
  const profiles=r.kind==='mount'?facts(db,'mount_profiles','f.mount_id=?',r.id):facts(db,'battalion_profiles','f.battalion_id=?',r.id);
  const progression=facts(db,'progression_steps','f.owner_id=?',r.id),statProfiles=facts(db,'stat_profiles','f.owner_id=?',r.id);
  const values=query(db,"SELECT * FROM records WHERE record_kind='stat_values' AND json_extract(body_json,'$.profile_id') IN (SELECT record_id FROM stat_profiles WHERE owner_id=?) ORDER BY id",r.id).map(row=>detailRecordSchemas.stat_values.parse({id:row.id,record_kind:row.record_kind,entity_id:row.entity_id,context_id:row.context_id,body:JSON.parse(row.body_json)}));
  const detailScope=scope(db,[...profiles,...progression,...statProfiles,...values]);
  const displayFacts:{label:string;value:string}[]=[],actions:{id:string;name:string;label:string}[]=[];
  for(const p of profiles){const b=p.body;if('food_category'in b){displayFacts.push({label:'Food',value:factText(b.food_category)},{label:'Taste',value:factText(b.taste_text)},{label:'Reported acquisition',value:factText(b.acquisition_text)});}else{displayFacts.push({label:'Grade',value:factText(b.grade_id)},{label:'Category',value:factText(b.category_text)},{label:'Base limit',value:factText(b.limit_base)},{label:'Upgraded limit',value:factText(b.limit_upgraded)});if(b.gambit_id)actions.push({id:b.gambit_id,name:b.gambit_label??entity(db,b.gambit_id)?.name??'Gambit',label:'Gambit'});}}
  for(const p of progression){displayFacts.push({label:`Level ${p.body.level_text??p.body.level_low??'unknown'}`,value:factText(p.body.reward_text)});if(p.body.action_id)actions.push({id:p.body.action_id,name:entity(db,p.body.action_id)?.name??'Ability',label:`Level ${p.body.level_text??'unknown'}`});}
  return {entity:e,...detailScope,facts:displayFacts,stats:statProfiles.map(p=>({label:[p.body.role.replaceAll('_',' '),p.body.level_text?`Level ${p.body.level_text}`:null].filter(Boolean).join(' · '),values:values.filter(v=>v.body.profile_id===p.id).map(v=>({label:v.body.stat_id,value:statObservationText(v)}))})),actions};
}
