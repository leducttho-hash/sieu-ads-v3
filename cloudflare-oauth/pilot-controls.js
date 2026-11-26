/* Lucian UX/UI Prompt #438, #008, #416 · MIT (c) 2026 Seokwoooo.
 * Adapted for Pilot's existing operations; see LUCIAN-LICENSE.txt. */
const pilotFeedbackDownloads=new Set(['export-build','export-report','export-report-tsv','download-saved-build']);
const pilotFeedbackCopies=new Set(['copy','copy-landings','copy-posts','copy-build','copy-report','copy-page-list']);
const pilotFeedbackJobs=new Map(),pilotFeedbackStates=new Map(),pilotSegmentPositions=new Map();
const pilotFeedbackTimers=new Set();
let pilotFeedbackLastContext='';
const pilotFeedbackIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.5 12.5 4.5 4.5 8.5-9.5"/></svg>';
function pilotFeedbackKind(action){return pilotFeedbackDownloads.has(action)?'download':pilotFeedbackCopies.has(action)?'copy':'';}
function pilotFeedbackContext(){return JSON.stringify([capture(),ui.view]);}
function pilotFeedbackButtonKey(button){return JSON.stringify([button.dataset.action,button.dataset.args||'']);}
function pilotFeedbackLater(fn,ms){const timer=setTimeout(()=>{pilotFeedbackTimers.delete(timer);fn();},ms);pilotFeedbackTimers.add(timer);return timer;}
function pilotFeedbackPaint(button,record,busy,kind=pilotFeedbackKind(button.dataset.action)){
  // Daily's partial updates replace button.textContent but retain its classes.
  // Repair the child structure independently of the initial disabled/aria state.
  let labelElement=button.querySelector('.pilot-feedback-label');
  if(!labelElement){
    button.querySelector('.pilot-feedback-motion')?.remove();
    const label=document.createElement('span');label.className='pilot-feedback-label';
    while(button.firstChild)label.append(button.firstChild);
    button.append(label);labelElement=label;
  }
  if(!button.querySelector('.pilot-feedback-motion')){
    const motion=document.createElement('span');motion.className='pilot-feedback-motion';motion.setAttribute('aria-hidden','true');
    motion.innerHTML='<i class="pilot-feedback-spinner"></i><span class="pilot-feedback-check">'+pilotFeedbackIcon+'</span><i class="pilot-feedback-ring"></i>';
    button.append(motion);
  }
  if(!button.classList.contains('pilot-feedback-btn')){
    button.classList.add('pilot-feedback-btn');
    button.dataset.pilotOriginalDisabled=String(button.disabled);
    if(button.hasAttribute('aria-label'))button.dataset.pilotOriginalAria=button.getAttribute('aria-label');
  }
  button.classList.remove('pilot-feedback-download','pilot-feedback-copy');button.classList.add('pilot-feedback-'+kind);
  const label=labelElement.textContent.trim(),state=record?.state||'idle';
  button.dataset.pilotFeedbackState=state;
  button.style.setProperty('--pilot-feedback-size',(button.offsetHeight||33)+'px');
  button.disabled=button.dataset.pilotOriginalDisabled==='true'||!!busy;
  const ownBusy=state==='busy';
  if(ownBusy)button.setAttribute('aria-busy','true');else button.removeAttribute('aria-busy');
  const status=ownBusy?(record.kind==='download'?'Đang tạo file':'Đang copy'):state==='ok'?(record.kind==='download'?'Đã tạo file':'Đã copy'):state==='error'?'Chưa thành công. Có thể thử lại':'';
  if(status)button.setAttribute('aria-label',label+' · '+status);
  else if(button.dataset.pilotOriginalAria!==undefined)button.setAttribute('aria-label',button.dataset.pilotOriginalAria);
  else button.removeAttribute('aria-label');
}
function pilotFeedbackSync(){
  const context=pilotFeedbackContext();
  if(pilotFeedbackLastContext&&pilotFeedbackLastContext!==context){const status=document.getElementById('pilot-controls-status');if(status)status.textContent='';}
  pilotFeedbackLastContext=context;
  for(const [key,record]of pilotFeedbackStates)if(record.context!==context){clearTimeout(record.timer);pilotFeedbackTimers.delete(record.timer);pilotFeedbackStates.delete(key);}
  for(const button of document.querySelectorAll('[data-action]')){
    const kind=pilotFeedbackKind(button.dataset.action);if(!kind)continue;
    const key=JSON.stringify([context,pilotFeedbackButtonKey(button)]),record=pilotFeedbackStates.get(key),busy=pilotFeedbackJobs.has(context+'|'+kind);
    pilotFeedbackPaint(button,record,busy);
  }
  // Report export choices live in a menu that closes before dispatch. Reflect the
  // selected operation on its still-visible summary as well as the menu item.
  const dropdownRecords=[...pilotFeedbackStates.values()].filter(record=>record.context===context&&record.dropdown);
  const dropdown=dropdownRecords.find(record=>record.state==='busy')||dropdownRecords.at(-1);
  for(const summary of document.querySelectorAll('details.export-dropdown > summary'))pilotFeedbackPaint(summary,dropdown,dropdown?.state==='busy',dropdown?.kind||'download');
}
function pilotFeedbackAnnounce(text){
  let status=document.getElementById('pilot-controls-status');
  if(!status){status=document.createElement('p');status.id='pilot-controls-status';status.className='pilot-controls-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);}
  status.textContent=text;
}
function pilotFeedbackCopyRecord(){return pilotFeedbackJobs.get(pilotFeedbackContext()+'|copy');}
const pilotOriginalCopyText=copyText;
copyText=async function(...values){const record=pilotFeedbackCopyRecord(),result=await pilotOriginalCopyText(...values);if(record)record.effects++;return result;};
async function pilotFeedbackClipboardWrite(items){const record=pilotFeedbackCopyRecord(),result=await navigator.clipboard.write(items);if(record)record.effects++;return result;}
function pilotFeedbackFrame(){return new Promise(resolve=>{
  let settled=false,frame;const finish=()=>{if(settled)return;settled=true;clearTimeout(timer);if(frame)cancelAnimationFrame(frame);resolve();};
  const timer=setTimeout(finish,80);frame=requestAnimationFrame(()=>setTimeout(finish,0));
});}
const pilotControlsOriginalPerform=perform;
perform=async function(action,a={},el){
  const kind=pilotFeedbackKind(action);
  if(!kind||!el?.matches?.('[data-action]'))return pilotControlsOriginalPerform(action,a,el);
  const context=pilotFeedbackContext(),jobKey=context+'|'+kind;
  if(pilotFeedbackJobs.has(jobKey))return;
  const key=JSON.stringify([context,pilotFeedbackButtonKey(el)]),prior=pilotFeedbackStates.get(key);
  if(prior?.timer){clearTimeout(prior.timer);pilotFeedbackTimers.delete(prior.timer);}
  const record={context,kind,state:'busy',effects:0,timer:null,dropdown:!!el.closest('details.export-dropdown')};
  pilotFeedbackJobs.set(jobKey,record);pilotFeedbackStates.set(key,record);
  try{
    pilotFeedbackSync();
    pilotFeedbackAnnounce(kind==='download'?'Đang tạo file…':'Đang copy…');
    // Give the browser a paint opportunity before XLSX work, without delaying clipboard activation.
    if(kind==='download')await pilotFeedbackFrame();
    if(context!==pilotFeedbackContext())return;
    const value=await pilotControlsOriginalPerform(action,a,el);
    if(context===pilotFeedbackContext()){
      record.state=kind==='copy'&&!record.effects?'idle':'ok';
      if(record.state==='ok')pilotFeedbackAnnounce(kind==='download'?'Đã tạo file.':'Đã copy.');
      else pilotFeedbackAnnounce('');
    }
    return value;
  }catch(error){
    if(context===pilotFeedbackContext()){record.state='error';pilotFeedbackAnnounce(error.message||'Chưa thành công. Thử lại.');}
    throw error;
  }finally{
    if(pilotFeedbackJobs.get(jobKey)===record)pilotFeedbackJobs.delete(jobKey);
    if(context===pilotFeedbackContext()){
      pilotFeedbackSync();
      record.timer=pilotFeedbackLater(()=>{if(pilotFeedbackStates.get(key)===record){pilotFeedbackStates.delete(key);pilotFeedbackSync();}},record.state==='error'?2400:1200);
    }else pilotFeedbackStates.delete(key);
  }
};
function pilotSegmentButtons(group){return Array.from(group.children).filter(el=>el.matches?.('button[data-action]'));}
function pilotSegmentSelection(button){return button.dataset.channelSeg?button.classList.contains('active'):button.classList.contains('primary');}
function pilotSegmentPlace(group,animate=true){
  if(!group.isConnected)return;
  const buttons=pilotSegmentButtons(group),selected=buttons.find(pilotSegmentSelection);if(!selected)return;
  const indicator=group.querySelector('.pilot-segment-thumb'),key=group.dataset.pilotSegments;
  const next={left:selected.offsetLeft,top:selected.offsetTop,width:selected.offsetWidth,height:selected.offsetHeight};
  const before=pilotSegmentPositions.get(key);
  for(const button of buttons)button.setAttribute('aria-pressed',String(button===selected));
  const put=position=>{for(const [k,v]of Object.entries(position))indicator.style.setProperty('--pilot-segment-'+k,v+'px');};
  indicator.style.transition='none';put(animate&&before?before:next);
  void indicator.offsetWidth;indicator.style.transition='';put(next);pilotSegmentPositions.set(key,next);
}
let pilotSegmentObserver=null;
function pilotSegmentsSync(){
  pilotSegmentObserver?.disconnect();
  const header=document.querySelector('.channel-seg');
  if(header){header.dataset.pilotSegments='channel';header.classList.add('pilot-segments');}
  const source=document.querySelector('#crm-api-panel .crm-api-source-switch');
  if(source&&!source.querySelector('.pilot-source-tabs')){
    const buttons=Array.from(source.children).filter(el=>el.dataset?.action==='crm-api-source');
    if(buttons.length===2){const group=document.createElement('div');group.className='pilot-segments pilot-source-tabs';group.dataset.pilotSegments='crm-source';group.setAttribute('role','group');group.setAttribute('aria-label','Nguồn CRM');source.insertBefore(group,buttons[0]);buttons.forEach(button=>group.append(button));}
  }
  for(const group of document.querySelectorAll('.pilot-segments')){
    if(!group.querySelector('.pilot-segment-thumb')){const thumb=document.createElement('span');thumb.className='pilot-segment-thumb';thumb.setAttribute('aria-hidden','true');group.append(thumb);}
    pilotSegmentPlace(group);
    if(typeof ResizeObserver!=='undefined'){
      pilotSegmentObserver??=new ResizeObserver(entries=>{for(const entry of entries)pilotSegmentPlace(entry.target,false);});pilotSegmentObserver.observe(group);
    }
  }
}
function pilotControlsRefresh(){pilotFeedbackSync();pilotSegmentsSync();}
const pilotControlsOriginalRender=render;
render=function(...values){const result=pilotControlsOriginalRender(...values);pilotControlsRefresh();return result;};
// Reapply feedback after the existing incremental Daily updates, without changing
// their row selection, Page mapping, URL data or focus handling.
const pilotControlsOriginalUpdateDailyRow=updateDailyRowInPlace;
updateDailyRowInPlace=function(...values){const result=pilotControlsOriginalUpdateDailyRow(...values);pilotFeedbackSync();return result;};
const pilotControlsOriginalRefreshDailyTable=refreshDailyTableOnly;
refreshDailyTableOnly=function(...values){const result=pilotControlsOriginalRefreshDailyTable(...values);pilotFeedbackSync();return result;};
document.addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  const button=event.target.closest?.('.pilot-segments > button[data-action]'),group=button?.parentElement;if(!group)return;
  const buttons=pilotSegmentButtons(group).filter(el=>!el.disabled),at=buttons.indexOf(button);if(at<0)return;
  const next=event.key==='ArrowRight'?(at+1)%buttons.length:event.key==='ArrowLeft'?(at+buttons.length-1)%buttons.length:event.key==='Home'?0:event.key==='End'?buttons.length-1:-1;
  if(next<0)return;event.preventDefault();const target=buttons[next],action=target.dataset.action,encoded=target.dataset.args||'',groupKey=group.dataset.pilotSegments;
  target.click();pilotFeedbackLater(()=>{const fresh=Array.from(document.querySelectorAll('.pilot-segments')).find(el=>el.dataset.pilotSegments===groupKey);pilotSegmentButtons(fresh||{children:[]}).find(el=>el.dataset.action===action&&(el.dataset.args||'')===encoded)?.focus({preventScroll:true});},0);
});
window.addEventListener('resize',()=>{for(const group of document.querySelectorAll('.pilot-segments'))pilotSegmentPlace(group,false);});
window.addEventListener('pagehide',()=>{for(const timer of pilotFeedbackTimers)clearTimeout(timer);pilotFeedbackTimers.clear();pilotSegmentObserver?.disconnect();});
document.fonts?.ready.then(()=>{for(const group of document.querySelectorAll('.pilot-segments'))pilotSegmentPlace(group,false);});
