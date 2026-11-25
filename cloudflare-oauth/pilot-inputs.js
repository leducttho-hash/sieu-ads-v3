/* Lucian UX/UI Prompt #432, #434, #437, #449, #030 · MIT (c) 2026 Seokwoooo.
 * Presentation adapters only. Original imports, validation, date arithmetic and API calls remain authoritative. */
const pilotUiUploads=new Map(),pilotUiUploadKinds=new Set(['report','crm','report-links','links','source','scale']);
let pilotUiContext='',pilotUiTooltipTarget=null,pilotUiTooltipTimer=null,pilotUiTooltipMuted=null,pilotUiCalendarFocus='';
const pilotUiChevron='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>';
function pilotUiScope(){return JSON.stringify([capture(),ui.view]);}
function pilotUiUploadKey(kind){return pilotUiScope()+'|'+kind;}
function pilotUiUploadSync(){
  const context=pilotUiScope();if(pilotUiContext&&pilotUiContext!==context){pilotUiUploads.clear();pilotUiTooltipHide();}pilotUiContext=context;
  for(const zone of document.querySelectorAll('.drop-zone[data-drop-kind]')){
    zone.classList.add('pilot-ui-drop');
    if(!zone.querySelector('.pilot-ui-file-icon')){const icon=document.createElement('span');icon.className='pilot-ui-file-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z M14 2v6h6 M8 14h8 M8 18h5"/></svg>';zone.prepend(icon);}
    const record=pilotUiUploads.get(pilotUiUploadKey(zone.dataset.dropKind));
    let status=zone.querySelector('.pilot-ui-file-status');
    if(!status){status=document.createElement('div');status.className='pilot-ui-file-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');zone.append(status);}
    zone.dataset.pilotUpload=record?.state||'idle';zone.setAttribute('aria-busy',String(record?.state==='busy'));
    status.hidden=!record;
    if(record){status.textContent=(record.state==='busy'?'Đang đọc':record.state==='pending'?'Chờ xác nhận':record.state==='done'?'Đã nhập':record.state==='error'?'Chưa nhập được':'Không thêm file mới')+' · '+record.names.join(', ');status.title=record.error||record.names.join('\n');}
  }
}
const pilotUiOriginalSelectFiles=selectFiles;
selectFiles=async function(kind,files){
  if(!pilotUiUploadKinds.has(kind))return pilotUiOriginalSelectFiles(kind,files);
  const context=pilotUiScope(),key=pilotUiUploadKey(kind),batch=[...files],prior=new Set(pendingImports.map(p=>p.id));
  const record={context,state:'busy',names:batch.map(f=>String(f.name)),pending:new Set()};pilotUiUploads.set(key,record);pilotUiUploadSync();
  try{const value=await pilotUiOriginalSelectFiles(kind,batch);
    if(context===pilotUiScope()){
      record.pending=new Set(pendingImports.filter(p=>!prior.has(p.id)&&p.kind===kind&&p.token===capture()).map(p=>p.id));
      record.state=record.pending.size?'pending':'idle';pilotUiUploadSync();
    }return value;
  }catch(error){if(context===pilotUiScope()){record.state='error';record.error=error.message;pilotUiUploadSync();}throw error;}
};
const pilotUiOriginalConfirmImport=confirmImport;
confirmImport=async function(p){
  const context=pilotUiScope(),record=pilotUiUploads.get(pilotUiUploadKey(p.kind));
  try{const value=await pilotUiOriginalConfirmImport(p);
    if(context===pilotUiScope()&&record?.pending.has(p.id)&&!pendingImports.some(x=>x.id===p.id)){record.pending.delete(p.id);record.state=record.pending.size?'pending':'done';pilotUiUploadSync();}
    return value;
  }catch(error){if(context===pilotUiScope()&&record){record.state='error';record.error=error.message;pilotUiUploadSync();}throw error;}
};
function pilotUiPageWindow(current,total){
  if(total<=7)return Array.from({length:total},(_,i)=>i+1);
  if(current<=4)return [1,2,3,4,5,0,total];
  if(current>=total-3)return [1,0,total-4,total-3,total-2,total-1,total];
  return [1,0,current-1,current,current+1,0,total];
}
function pilotUiPageNav(current,total,kind){
  current=Math.max(1,Math.min(total,current));
  const action=kind==='crm'?'pilot-ui-crm-page':'page';
  const button=(page,label,extra='')=>`<button type="button" class="btn pilot-ui-page ${extra}" data-action="${action}" data-args="${args(kind==='crm'?{page}:{delta:page-current})}" aria-label="${esc(label)}" ${page===current?'aria-current="page"':''} ${page<1||page>total?'disabled':''}>${extra?pilotUiChevron:page}</button>`;
  return `<nav class="pilot-ui-pages" aria-label="${kind==='crm'?'Trang mã CRM':'Trang dữ liệu'}">${button(current-1,'Trang trước','pilot-ui-page-prev')}<div class="pilot-ui-page-slots">${pilotUiPageWindow(current,total).map(page=>page?button(page,'Trang '+page):'<span class="pilot-ui-page-dots" aria-hidden="true">…</span>').join('')}</div>${button(current+1,'Trang sau','pilot-ui-page-next')}</nav>`;
}
pager=function(total,n){return `<div class="pager pilot-ui-pager"><span class="pilot-ui-page-count">${total} dòng · <b>Trang ${ui.page}/${n}</b></span><div class="actions">${pilotUiPageNav(ui.page,n,'table')}<select data-ui="size" aria-label="Số dòng">${[50,100,200].map(v=>`<option ${ui.size===v?'selected':''}>${v}</option>`).join('')}</select></div></div>`;};
const pilotUiOriginalPreview=crmApiPreviewResults;
crmApiPreviewResults=function(d){
  const original=pilotUiOriginalPreview(d),s=crmApiState(),q=String(s.previewQuery||'').trim().toUpperCase();
  const count=d.crm.filter(row=>!q||String(row.code).toUpperCase().includes(q)).length,pages=Math.max(1,Math.ceil(count/20));
  const footer=`<div class="crm-api-preview-pager pilot-ui-pager"><span>${count} mã</span>${pilotUiPageNav(s.previewPage+1,pages,'crm')}</div>`;
  return /<div class="crm-api-preview-pager">/.test(original)?original.replace(/<div class="crm-api-preview-pager">[\s\S]*<\/div>$/,footer):original+footer;
};
const pilotUiIconNames={'move-row':['Di chuyển lên','Di chuyển xuống'],'delete-row':'Xóa dòng','close-modal':'Đóng','remove-source':'Xóa nguồn','crm-api-range-nav':['Tháng trước','Tháng sau']};
function pilotUiIconName(button){
  if(!button||!button.matches('button,summary,[role="button"]'))return '';
  if(button.dataset.pilotTooltip)return button.dataset.pilotTooltip;
  if(!/^[\s×✕✖↑↓←→‹›<>⚙☀☾✎⋮…]+$/.test(button.textContent||''))return '';
  let name=button.getAttribute('aria-label')||button.getAttribute('title')||pilotUiIconNames[button.dataset.action];
  if(Array.isArray(name)){let a={};try{a=JSON.parse(decodeURIComponent(button.dataset.args||''));}catch{}name=name[Number(a.delta)>0?1:0];}
  if(!name){const icons={'×':'Xóa','✕':'Đóng','↑':'Di chuyển lên','↓':'Di chuyển xuống','‹':'Trang trước','›':'Trang sau','⚙':'Cài đặt'};name=icons[button.textContent.trim()];}
  if(!name)return '';
  button.dataset.pilotTooltip=name;if(!button.hasAttribute('aria-label'))button.setAttribute('aria-label',name);
  if(button.hasAttribute('title')){button.dataset.pilotTooltipTitle=button.getAttribute('title');button.removeAttribute('title');}
  return name;
}
function pilotUiTooltipHide(){
  clearTimeout(pilotUiTooltipTimer);pilotUiTooltipTimer=null;
  const target=pilotUiTooltipTarget,tip=document.getElementById('pilot-ui-tooltip');
  if(target){const ids=(target.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!=='pilot-ui-tooltip');if(ids.length)target.setAttribute('aria-describedby',ids.join(' '));else target.removeAttribute('aria-describedby');}
  pilotUiTooltipTarget=null;tip?.remove();
}
function pilotUiTooltipShow(target){
  const text=pilotUiIconName(target);if(!text||!target.isConnected||target===pilotUiTooltipMuted)return;
  pilotUiTooltipHide();pilotUiTooltipTarget=target;
  const tip=document.createElement('div');tip.id='pilot-ui-tooltip';tip.className='pilot-ui-tooltip';tip.setAttribute('role','tooltip');tip.textContent=text;document.body.append(tip);
  target.setAttribute('aria-describedby',[target.getAttribute('aria-describedby'),'pilot-ui-tooltip'].filter(Boolean).join(' '));
  const r=target.getBoundingClientRect(),t=tip.getBoundingClientRect(),above=r.top>=t.height+12;
  tip.style.left=Math.max(8,Math.min(window.innerWidth-t.width-8,r.left+(r.width-t.width)/2))+'px';
  tip.style.top=Math.max(8,Math.min(window.innerHeight-t.height-8,above?r.top-t.height-8:r.bottom+8))+'px';tip.dataset.side=above?'above':'below';
}
function pilotUiTooltipWant(target,immediate=false){
  const name=pilotUiIconName(target);if(!name||target===pilotUiTooltipMuted)return;
  clearTimeout(pilotUiTooltipTimer);if(immediate)pilotUiTooltipShow(target);else pilotUiTooltipTimer=setTimeout(()=>pilotUiTooltipShow(target),250);
}
function pilotUiTooltipLeave(target,related){
  if(related?.closest?.('#pilot-ui-tooltip')||related===target)return;
  if(pilotUiTooltipMuted===target)pilotUiTooltipMuted=null;
  clearTimeout(pilotUiTooltipTimer);pilotUiTooltipTimer=setTimeout(()=>{if(document.activeElement!==target)pilotUiTooltipHide();},100);
}
function pilotUiFieldTouch(field){
  if(!field?.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),textarea,select'))return;
  field.classList.add('pilot-ui-field','pilot-ui-touched');
  // Paint browser constraints already present on the field. Do not add or change any rule.
  field.classList.toggle('pilot-ui-native-invalid',!!field.validity&&!field.validity.valid);
}
function pilotUiRangeDay(button){try{return JSON.parse(decodeURIComponent(button.dataset.args||'')).day||'';}catch{return '';}}
function pilotUiCalendarButtons(){return Array.from(document.querySelectorAll('#crm-api-range-popup .crm-range-day'));}
function pilotUiRangePreview(day=''){
  const draft=crmApiRangeDraft;if(!draft)return;
  const active=draft.selectingEnd&&day&&day<=crmApiToday(),start=day<draft.start?day:draft.start,end=day<draft.start?draft.start:day;
  for(const button of pilotUiCalendarButtons()){const iso=pilotUiRangeDay(button);button.toggleAttribute('data-pilot-range-preview',!!active&&iso>=start&&iso<=end);}
}
function pilotUiRangePosition(){
  const popup=document.querySelector('#crm-api-range-popup'),anchor=document.querySelector('[data-action="crm-api-open-range"]');if(!popup||!anchor)return;
  const r=anchor.getBoundingClientRect(),p=popup.getBoundingClientRect();
  popup.style.left=Math.max(12,Math.min(r.left,window.innerWidth-p.width-12))+'px';
  popup.style.top=Math.max(12,Math.min(r.bottom+6,window.innerHeight-p.height-12))+'px';
}
function pilotUiRangeDecorate(){
  const popup=document.querySelector('#crm-api-range-popup'),draft=crmApiRangeDraft;if(!popup||!draft)return;
  popup.classList.add('pilot-ui-calendar');
  popup.querySelector('.pilot-ui-date-pills')?.remove();
  const pills=document.createElement('div');pills.className='pilot-ui-date-pills';pills.innerHTML=`<div class="${draft.selectingEnd?'':'on'}"><small>Từ ngày</small><b>${crmApiDateLabel(draft.start)}</b></div><div class="${draft.selectingEnd?'on':''}"><small>Đến ngày</small><b>${draft.selectingEnd?'Chọn ngày kết thúc':crmApiDateLabel(draft.end)}</b></div>`;popup.prepend(pills);
  const buttons=pilotUiCalendarButtons(),focus=pilotUiCalendarFocus||draft.start;
  const active=buttons.find(b=>pilotUiRangeDay(b)===focus&&!b.classList.contains('outside-month'))||buttons.find(b=>pilotUiRangeDay(b)===focus)||buttons.find(b=>!b.disabled&&!b.classList.contains('outside-month'));
  for(const button of buttons){const iso=pilotUiRangeDay(button);button.tabIndex=button===active?0:-1;button.toggleAttribute('data-pilot-range-start',iso===draft.start);button.toggleAttribute('data-pilot-range-end',iso===draft.end&&!draft.selectingEnd);if(iso===crmApiToday())button.setAttribute('aria-current','date');}
  const apply=popup.querySelector('[data-action="crm-api-range-apply"]');if(apply)apply.disabled=draft.selectingEnd;
  popup.querySelectorAll('.crm-range-toolbar button').forEach(pilotUiIconName);
  pilotUiRangePosition();
}
const pilotUiOriginalRangeRender=crmApiRangeRender;
crmApiRangeRender=function(){const value=pilotUiOriginalRangeRender();pilotUiRangeDecorate();return value;};
function pilotUiRangeFocus(day){
  const draft=crmApiRangeDraft;if(!draft||day>crmApiToday())return;
  pilotUiCalendarFocus=day;
  const visible=pilotUiCalendarButtons().some(b=>pilotUiRangeDay(b)===day&&!b.classList.contains('outside-month'));
  if(!visible){draft.month=day.slice(0,7);crmApiRangeRender();}else pilotUiRangeDecorate();
  const buttons=pilotUiCalendarButtons(),target=buttons.find(b=>pilotUiRangeDay(b)===day&&!b.classList.contains('outside-month'))||buttons.find(b=>pilotUiRangeDay(b)===day);
  target?.focus({preventScroll:true});pilotUiRangePreview(day);
}
function pilotUiCalendarKey(event){
  const button=event.target.closest?.('#crm-api-range-popup .crm-range-day');if(!button||event.altKey||event.ctrlKey||event.metaKey)return;
  const day=pilotUiRangeDay(button),weekday=(new Date(day+'T00:00:00Z').getUTCDay()+6)%7;
  const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-weekday,End:6-weekday}[event.key];
  let next=delta===undefined?'':crmApiShiftDay(day,delta);
  if(['PageUp','PageDown'].includes(event.key)){const month=crmApiRangeMonth(day.slice(0,7),event.key==='PageUp'?-1:1),last=Number(crmApiShiftDay(crmApiRangeMonth(month,1)+'-01',-1).slice(8));next=month+'-'+String(Math.min(Number(day.slice(8)),last)).padStart(2,'0');}
  if(!next)return;event.preventDefault();pilotUiRangeFocus(next>crmApiToday()?crmApiToday():next);
}
const pilotUiOriginalPerform=perform;
perform=async function(action,a={},el){
  if(action==='pilot-ui-crm-page'){
    const s=crmApiState(),q=String(s.previewQuery||'').trim().toUpperCase(),count=reportData().crm.filter(r=>!q||String(r.code).toUpperCase().includes(q)).length;
    const page=Number(a.page);if(!Number.isInteger(page))return;s.previewPage=Math.max(0,Math.min(Math.max(1,Math.ceil(count/20))-1,page-1));render();
    document.querySelector('.crm-api-preview-pager [aria-current="page"]')?.focus({preventScroll:true});return;
  }
  if(action==='crm-api-open-range')pilotUiCalendarFocus='';
  if(action==='crm-api-range-day')pilotUiCalendarFocus=a.day;
  const value=await pilotUiOriginalPerform(action,a,el);
  if(action==='crm-api-open-range'){const popup=document.querySelector('#crm-api-range-popup');popup?.querySelector('.crm-range-day[tabindex="0"]')?.focus({preventScroll:true});}
  if(['crm-api-range-day','crm-api-range-nav'].includes(action)){
    if(action==='crm-api-range-nav'){const first=pilotUiCalendarButtons().find(b=>!b.disabled&&!b.classList.contains('outside-month'));pilotUiCalendarFocus=first?pilotUiRangeDay(first):'';pilotUiRangeDecorate();}
    if(action==='crm-api-range-day')pilotUiRangeFocus(a.day);
  }
  if(['crm-api-range-cancel','crm-api-range-apply'].includes(action))document.querySelector('[data-action="crm-api-open-range"]')?.focus({preventScroll:true});
  return value;
};
function pilotUiRefresh(){
  document.body.classList.add('pilot-ui-enabled');pilotUiUploadSync();
  for(const button of document.querySelectorAll('#content button,#modal button'))pilotUiIconName(button);
}
const pilotUiOriginalRender=render;
render=function(...values){pilotUiTooltipHide();const value=pilotUiOriginalRender(...values);pilotUiRefresh();return value;};
document.addEventListener('focusout',e=>{pilotUiFieldTouch(e.target);if(e.target===pilotUiTooltipMuted)pilotUiTooltipMuted=null;if(e.target===pilotUiTooltipTarget)pilotUiTooltipHide();});
document.addEventListener('input',e=>{if(e.target.classList?.contains('pilot-ui-touched'))pilotUiFieldTouch(e.target);});
document.addEventListener('focusin',e=>{const button=e.target.closest?.('button,summary,[role="button"]');if(button)pilotUiTooltipWant(button,true);});
document.addEventListener('pointerover',e=>{
  const button=e.target.closest?.('button,summary,[role="button"]');if(button&&!button.contains(e.relatedTarget)&&e.pointerType!=='touch')pilotUiTooltipWant(button);
  if(e.target.closest?.('#pilot-ui-tooltip'))clearTimeout(pilotUiTooltipTimer);
  const day=e.target.closest?.('#crm-api-range-popup .crm-range-day');if(day&&!day.disabled)pilotUiRangePreview(pilotUiRangeDay(day));
});
document.addEventListener('pointerout',e=>{
  const button=e.target.closest?.('button,summary,[role="button"]');if(button&&!button.contains(e.relatedTarget))pilotUiTooltipLeave(button,e.relatedTarget);
  if(e.target.closest?.('#pilot-ui-tooltip')&&!e.relatedTarget?.closest?.('#pilot-ui-tooltip'))pilotUiTooltipHide();
  if(e.target.closest?.('#crm-api-range-popup')&&!e.relatedTarget?.closest?.('#crm-api-range-popup'))pilotUiRangePreview();
});
document.addEventListener('pointerdown',()=>{pilotUiTooltipMuted=pilotUiTooltipTarget;pilotUiTooltipHide();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){pilotUiTooltipMuted=pilotUiTooltipTarget;pilotUiTooltipHide();}pilotUiCalendarKey(e);});
document.addEventListener('scroll',pilotUiTooltipHide,true);
window.addEventListener('resize',()=>{pilotUiTooltipHide();if(crmApiRangeDraft){const focused=document.activeElement?.matches?.('.crm-range-day')?pilotUiRangeDay(document.activeElement):'';crmApiRangeRender();if(focused)pilotUiRangeFocus(focused);}});
window.addEventListener('pagehide',()=>{pilotUiTooltipHide();pilotUiUploads.clear();});
