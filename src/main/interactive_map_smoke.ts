export const interactiveMapSmoke=`(async()=>{
  const wait=async(test,message)=>{for(let n=0;n<120;n++){if(await test())return;await new Promise(r=>setTimeout(r,50));}throw Error(message);};
  const navigate=label=>[...document.querySelectorAll('.app_navigation button')].find(b=>b.textContent===label).click();
  const root=()=>document.querySelector('.interactive_map');
  const button=text=>[...(root()?.querySelectorAll('button')??[])].find(b=>b.textContent.trim()===text);
  navigate('Map');await wait(()=>root()?.querySelector('.map_canvas'),'Map did not open');
  if(document.querySelector('#result_count'))throw Error('Map opening loaded unrelated libraries');
  const initial=await window.loom.mapOverview();
  if(root().querySelectorAll('.map_contexts button').length!==5||root().querySelectorAll('.map_filters button[aria-pressed]').length!==17)throw Error('Map views/categories missing');
  for(const context of initial.contexts){button(context.label).click();await wait(()=>root().getAttribute('data-map-context')===context.id&&root().getAttribute('aria-busy')==='false','Story view did not load');const overview=await window.loom.mapOverview(context.id);if(!root().querySelector('.map_footer').textContent.includes(String(overview.locations.filter(l=>l.contextIds.includes(context.id)).length)))throw Error('Location list was truncated');}
  const background=root().querySelector('.map_background');await background.decode();if(!background.naturalWidth)throw Error('Bundled map image failed');
  root().querySelector('.map_filters').open=true;button('Hide All').click();await wait(()=>root().querySelector('.map_empty'),'All-off filters did not empty map');
  await wait(async()=>{const p=await window.loom.loadMapPreference();return p?.categoryIds.length===0;},'All-off filters not saved');
  button('Reset Filters').click();await wait(()=>!root().querySelector('.map_empty'),'Filter reset failed');root().querySelector('.map_filters').open=false;
  const search=async text=>{const input=document.querySelector('#map_search_input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));await wait(()=>root().querySelector('.map_suggestions button'),'Search suggestions missing');};
  const choose=async name=>{await search(name);const choice=[...root().querySelectorAll('.map_suggestions button')].find(b=>b.querySelector('strong').textContent===name);if(!choice)throw Error('Exact suggestion missing '+name);choice.click();};
  await choose('Kassite');await wait(()=>root().querySelector('.map_panel h2')?.textContent==='Kassite'&&root().querySelector('.map_content_group'),'Location panel missing');
  const armory=[...root().querySelectorAll('.map_content_group')].find(s=>s.querySelector('h3').textContent==='Armory');if(!armory||!armory.textContent.includes('Short Spear+2')||armory.textContent.includes('Bronze Spear'))throw Error('Part III replacement inventory leaked base stock');
  armory.querySelector('button').click();await wait(()=>document.querySelector('.map_reference_dialog[open]')?.textContent.includes('Short Spear+2'),'Item reference dialog failed');document.querySelector('.map_reference_dialog header button').click();
  await choose('Iron Sword');await wait(()=>root().querySelector('.map_panel h2')?.textContent==='Iron Sword'&&root().querySelector('.map_location_list li'),'Content destinations missing');
  const results=root().querySelectorAll('.map_location_list li').length;if(results<2)throw Error('Reverse content lookup incomplete');
  root().querySelector('.map_location_list button').click();await wait(()=>[...root().querySelectorAll('.map_panel button')].some(b=>b.textContent.includes('Back to Iron Sword')),'Destination lost search context');
  [...root().querySelectorAll('.map_panel button')].find(b=>b.textContent.includes('Back to Iron Sword')).click();
  await choose('Wild Horse');await wait(()=>root().querySelector('.map_panel h2')?.textContent==='Wild Horse','Mount search failed');button('View mount details').click();await wait(()=>document.querySelector('.map_reference_dialog[open]')?.textContent.includes('Food'),'Mount reference failed');document.querySelector('.map_reference_dialog header button').click();
  await choose('Dagsion');await wait(()=>root().querySelector('.map_marker.selected'),'Marker selection missing');
  const markerBounds=()=>root().querySelector('.map_marker.selected').getBoundingClientRect();
  const startMarker=markerBounds().width,startMap=root().querySelector('.map_image_plane').getBoundingClientRect().width;
  for(let n=0;n<3;n++){const before=markerBounds().width;root().querySelector('[aria-label="Zoom in"]').click();await wait(()=>markerBounds().width>before,'Marker hit area did not grow with zoom');}
  const bounds=markerBounds(),mapWidth=root().querySelector('.map_image_plane').getBoundingClientRect().width;
  if(Math.abs(bounds.width/startMarker-mapWidth/startMap)>.01)throw Error('Marker does not scale with the map tiles');
  const edgeX=bounds.left+bounds.width*.85,edgeY=bounds.top+bounds.height/2;
  const edge=document.elementFromPoint(edgeX,edgeY)?.closest('[data-map-marker]');
  if(edge?.getAttribute('data-map-marker')!==root().querySelector('.map_marker.selected').getAttribute('data-map-marker'))throw Error('Enlarged marker edge is not clickable');
  root().querySelector('[aria-label="Clear location selection"]').click();await wait(()=>!root().querySelector('.map_marker.selected'),'Marker did not clear');
  edge.click();await wait(()=>root().querySelector('.map_panel h2')?.textContent==='Dagsion','Clicking enlarged marker edge did not select its location');
  await choose('Iron Sword');root().querySelector('[aria-label="Zoom in"]').click();
  await wait(async()=>{const p=await window.loom.loadMapPreference();return p?.contextId===initial.contexts[4].id&&p?.target?.name==='Iron Sword'&&p.zoom>1;},'Map view not automatically saved');
  const saved=await window.loom.loadMapPreference();navigate('Character Profile');navigate('Map');await wait(()=>root().getAttribute('data-map-context')===saved.contextId,'Returning to map lost view');
  for(const image of root().querySelectorAll('.map_marker img'))await image.decode();
  if(document.documentElement.scrollWidth>innerWidth)throw Error('Map overflows desktop window');
  return {interactiveMap:true,mapViews:5,mapCategories:17,mapLocations:initial.locations.length,mapDestinations:results,mapRestoration:true,mapMarkerZoomCoverage:true};
})()`;

export const mapRestoreSmoke=`(async()=>{
  const wait=async(test,message)=>{for(let n=0;n<120;n++){if(await test())return;await new Promise(r=>setTimeout(r,50));}throw Error(message);};
  await wait(()=>[...document.querySelectorAll('.app_navigation button')].some(b=>b.textContent==='Map'),'Navigation did not restore');
  const saved=await window.loom.loadMapPreference();[...document.querySelectorAll('.app_navigation button')].find(b=>b.textContent==='Map').click();
  await wait(()=>document.querySelector('.interactive_map')?.getAttribute('data-map-context')===saved.contextId&&document.querySelector('.map_panel h2')?.textContent===saved.target?.name,'Reload lost map context or committed search');
  await wait(()=>document.querySelector('.map_scale')?.textContent===Math.round(saved.zoom*100)+'%','Reload lost map zoom');
  return {mapReloadRestored:true};
})()`;

export const mapRecoverySmoke=`(async()=>{
  const wait=async(test,message)=>{for(let n=0;n<120;n++){if(await test())return;await new Promise(r=>setTimeout(r,50));}throw Error(message);};
  [...document.querySelectorAll('.app_navigation button')].find(b=>b.textContent==='Map').click();
  const root=()=>document.querySelector('.interactive_map');
  const button=text=>[...(root()?.querySelectorAll('button')??[])].find(b=>b.textContent.trim()===text);
  await wait(()=>button('Open with session defaults'),'Unreadable map preference did not offer recovery');
  button('Open with session defaults').click();await wait(()=>root().querySelector('.map_canvas'),'Session defaults failed');
  await new Promise(r=>setTimeout(r,400));
  let rejected=false;try{await window.loom.loadMapPreference();}catch{rejected=true;}if(!rejected)throw Error('Session defaults overwrote unread saved preference');
  button('Retry saved view').click();await wait(()=>root().textContent.includes('Map data or its saved view could not be loaded'),'Retry did not report unread preference');
  await new Promise(r=>setTimeout(r,400));rejected=false;try{await window.loom.loadMapPreference();}catch{rejected=true;}if(!rejected)throw Error('Failed retry overwrote unread preference');
  button('Reset All Map').click();await wait(()=>button('Retry saving'),'Database write failure was not shown');
  if(!root().querySelector('.map_canvas'))throw Error('Save failure erased the usable map');
  return {mapUnreadPreferencePreserved:true,mapSessionDefaults:true,mapWriteFailureVisible:true};
})()`;

export const mapRetrySaveSmoke=`(async()=>{
  [...document.querySelectorAll('.interactive_map button')].find(b=>b.textContent==='Retry saving').click();
  for(let n=0;n<120;n++){try{const p=await window.loom.loadMapPreference();if(p?.zoom===1&&p.categoryIds.length===17&&p.target===null)return {mapSaveRetry:true};}catch{}await new Promise(r=>setTimeout(r,50));}
  throw Error('Map save retry failed after the write error was removed');
})()`;
