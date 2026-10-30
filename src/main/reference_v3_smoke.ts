// Used only by the isolated --smoke-test entry point with the synthetic v3 fixture.
export const referenceV3Smoke = `(async () => {
  const wait = async (check, message) => { for(let n=0;n<80;n++) { if(check()) return; await new Promise(r=>setTimeout(r,50)); } throw new Error(message); };
  const overview=await window.loom.overview(), all=await window.loom.characters('all');
  if(all.length!==1 || all[0].id!=='cai' || (await window.loom.characters('leda')).length) throw new Error('Act 1 isolation failed');
  if((await window.loom.character('leda')).flags.recruitable_or_joins_in_part_1) throw new Error('Later-part character entered Act 1');
  if(all[0].growth_rates_percent.hp!==0 || all[0].growth_rates_percent.magic!==null) throw new Error('Numeric uncertainty lost');
  if(typeof window.require!=='undefined') throw new Error('Node leaked into renderer');
  await wait(()=>document.querySelector('#result_count strong')?.textContent==='1','Character Library did not render');
  const navigate=label=>{ const button=[...document.querySelectorAll('.app_navigation button')].find(b=>b.textContent?.startsWith(label)); if(!button) throw new Error('Navigation missing: '+label); button.click(); };
  navigate('Class Library');
  await wait(()=>document.querySelector('[data-class-id="commoner"] .class_name'),'Class Library did not render');
  document.querySelector('[data-class-id="commoner"] .class_name').click();
  await wait(()=>document.querySelector('#class_details')?.textContent?.includes('All of (swords C)'),'Reported grouping was not displayed');
  if(document.querySelector('#class_details')?.textContent?.includes('Listed grades are not interpreted as AND or OR')) throw new Error('Stale certification certainty text');
  if(!document.querySelector('#class_details')?.textContent?.includes('Reported usable skills')) throw new Error('Reported access hidden');
  navigate('Paralogue Library');
  await wait(()=>document.querySelector('.paralogue_name'),'Paralogue Library did not render');
  document.querySelector('.paralogue_name').click();
  await wait(()=>document.querySelector('#paralogue_details')?.textContent?.includes('Source Span'),'Unlabeled timing was not retained');
  const para=(await window.loom.paralogueLibrary()).paralogues[0];
  if(para.route_availability.cai.acceptance_windows.length || para.route_availability.cai.listed_completion_deadline!==null) throw new Error('Source span became an acceptance/deadline');
  await window.loom.setCharacterShortlisted('leda',true);await window.loom.setCharacterNote('leda','Preserved outside Act 1');
  const planning=(await window.loom.listCharacterPlanning()).find(p=>p.characterId==='leda');
  if(!planning?.shortlisted || planning.note!=='Preserved outside Act 1') throw new Error('Stable saved ID lost');
  const setup={version:1,search:'',mode:'all',filters:[],sorts:[{field:'name',direction:'asc'}]};
  await window.loom.saveSetup('cai',setup);if(!(await window.loom.loadSetup('cai'))) throw new Error('Saved setup failed');
  return {schema:3,overview,sourceSpanPreserved:true,savesPreserved:true};
})()`;
