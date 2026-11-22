/* Runs inside the existing app closure, only in the generated OAuth pilot. */
const CRM_BRIDGE_ID='mopcgklafblfklmngbhccfonefidcajf';
const CRM_BRIDGE_TYPE='SIEUADS_PILOT_CRM_V1';
let crmApiEpoch=0;
let crmApiRangeDraft=null;
const crmApiPending=new Map();
function crmApiScope(){return JSON.stringify([user().id,wh().id,db.session.channel]);}
function crmApiState(){const r=report();r.crmApiInputsV1??={};const sk=crmApiScope();return r.crmApiInputsV1[sk]??={source:'manual',startDate:'',endDate:'',cache:null};}
function crmApiConfig(){db.crmApiProfilesV1??={};const k=JSON.stringify([user().id,db.session.channel]);return db.crmApiProfilesV1[k]??={names:[],resolved:[]};}
function crmApiSignature(s=crmApiState(),c=crmApiConfig()){return JSON.stringify([crmApiScope(),s.startDate,s.endDate,[...c.names].sort()]);}
function crmApiReady(){const s=crmApiState();return s.source!=='api'||!!s.cache&&s.cache.signature===crmApiSignature()&&!s.error&&!crmApiPending.has(crmApiScope());}
function crmApiInputText(r){const s=crmApiState();return s.source==='api'?(s.cache?.tsv||''):r.crmPaste;}
function crmApiInvalidate(){crmApiEpoch++;crmApiRangeClose();}
function crmApiSend(op,body={}){
  return new Promise((resolve,reject)=>{
    if(!window.chrome?.runtime?.sendMessage){reject(Error('Cập nhật Extension CRM, Tải lại tiện ích rồi tải lại Pilot.'));return;}
    let done=false;const finish=(err,value)=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(value);};
    const timer=setTimeout(()=>finish(Error('Lấy CRM quá lâu. Dữ liệu cũ được giữ.')),210000);
    try{chrome.runtime.sendMessage(CRM_BRIDGE_ID,{type:CRM_BRIDGE_TYPE,op,...body},res=>{
      if(chrome.runtime.lastError){finish(Error('Chưa kết nối được Extension CRM. Cập nhật tiện ích rồi tải lại Pilot.'));return;}
      if(!res?.ok){finish(Error(res?.error||'Chưa đọc được CRM.'));return;}finish(null,res);
    });}catch(_){finish(Error('Chưa kết nối được Extension CRM.'));}
  });
}
function crmApiDateLabel(v){return /^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'—';}
function crmApiToday(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function crmApiShiftDay(day,offset){const d=new Date(day+'T00:00:00Z');if(!Number.isFinite(d.getTime()))throw Error('Ngày CRM không hợp lệ.');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
function crmApiReportPeriod(period,today=crmApiToday()){
  const days=period==='monday'?7:period==='thursday'?4:0;if(!days)throw Error('Kỳ báo cáo CRM không hợp lệ.');
  const target=period==='monday'?6:3,weekday=new Date(today+'T00:00:00Z').getUTCDay();
  const offset=(weekday-target+7)%7||7,endDate=crmApiShiftDay(today,-offset);
  return {startDate:crmApiShiftDay(endDate,-(days-1)),endDate};
}
function crmApiSetReportPeriod(period){const s=crmApiState();Object.assign(s,crmApiReportPeriod(period));s.error='';crmApiInvalidate();save();render();}
function crmApiRangeClose(){if(!crmApiRangeDraft)return;crmApiRangeDraft=null;document.querySelector('#crm-api-range-popup')?.remove();}
function crmApiRangeOpen(){
  crmApiRangeClose();const s=crmApiState(),start=s.startDate||crmApiShiftDay(crmApiToday(),-7),end=s.endDate||crmApiShiftDay(crmApiToday(),-1);
  const month=new Date(start.slice(0,7)+'-01T00:00:00Z');
  crmApiRangeDraft={scope:crmApiScope(),start,end,month:month.toISOString().slice(0,7),selectingEnd:false};
  const popup=document.createElement('section');popup.id='crm-api-range-popup';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Chọn khoảng ngày CRM');document.body.append(popup);crmApiRangeRender();
}
function crmApiRangeMonth(base,offset){const d=new Date(base+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+offset);return d.toISOString().slice(0,7);}
function crmApiCalendar(month){
  const draft=crmApiRangeDraft,first=new Date(month+'-01T00:00:00Z'),offset=(first.getUTCDay()+6)%7,today=crmApiToday();
  const cells=Array.from({length:42},(_,i)=>{const iso=crmApiShiftDay(month+'-01',i-offset),day=Number(iso.slice(8)),active=iso===draft.start||iso===draft.end,between=iso>draft.start&&iso<draft.end;
    return `<button type="button" class="crm-range-day${active?' selected':''}${between?' in-range':''}${iso.slice(0,7)!==month?' outside-month':''}" data-action="crm-api-range-day" data-args="${args({day:iso})}" aria-label="${crmApiDateLabel(iso)}" aria-pressed="${active}" ${iso>today?'disabled':''}>${day}</button>`;
  }).join('');
  return `<div class="crm-range-month"><h3>Tháng ${Number(month.slice(5))} · ${month.slice(0,4)}</h3><div class="crm-range-week">${['T2','T3','T4','T5','T6','T7','CN'].map(x=>`<span>${x}</span>`).join('')}</div><div class="crm-range-grid">${cells}</div></div>`;
}
function crmApiRangeRender(){
  const draft=crmApiRangeDraft,popup=document.querySelector('#crm-api-range-popup');if(!draft||!popup)return;
  popup.innerHTML=`<div class="crm-range-toolbar">${btn('crm-api-range-nav','‹',{delta:-1})}<span>${draft.selectingEnd?'Chọn ngày kết thúc':'Chọn ngày bắt đầu'}</span>${btn('crm-api-range-nav','›',{delta:1})}</div><div class="crm-range-calendars">${crmApiCalendar(draft.month)}${crmApiCalendar(crmApiRangeMonth(draft.month,1))}</div><div class="crm-range-footer"><span>${crmApiDateLabel(draft.start)} – ${crmApiDateLabel(draft.end)}</span>${btn('crm-api-range-cancel','Hủy')}${btn('crm-api-range-apply','Áp dụng',{},'primary')}</div>`;
  const anchor=document.querySelector('[data-action="crm-api-open-range"]');if(anchor){const r=anchor.getBoundingClientRect(),width=Math.min(560,Math.max(280,window.innerWidth-24)),height=popup.getBoundingClientRect().height||370;popup.style.width=width+'px';popup.style.left=Math.max(12,Math.min(r.left,window.innerWidth-width-12))+'px';popup.style.top=Math.max(12,Math.min(r.bottom+6,window.innerHeight-height-12))+'px';}
}
function crmApiRangeDay(day){
  const draft=crmApiRangeDraft;if(!draft||draft.scope!==crmApiScope())return;const date=new Date(day+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day||day>crmApiToday())throw Error('Ngày không hợp lệ.');
  if(!draft.selectingEnd){draft.start=day;draft.end=day;draft.selectingEnd=true;}else{if(day<draft.start){draft.end=draft.start;draft.start=day;}else draft.end=day;draft.selectingEnd=false;}crmApiRangeRender();
}
function crmApiRangeApply(){const draft=crmApiRangeDraft;if(!draft||draft.scope!==crmApiScope())throw Error('Hồ sơ đã đổi. Mở lại khoảng ngày.');if(draft.selectingEnd)throw Error('Chọn thêm ngày kết thúc; có thể chọn cùng ngày.');const s=crmApiState();s.startDate=draft.start;s.endDate=draft.end;s.error='';crmApiInvalidate();save();render();}
function crmApiPreviewResults(d){
  const s=crmApiState(),query=String(s.previewQuery||'').trim().toUpperCase();
  const rows=d.crm.filter(row=>!query||String(row.code).toUpperCase().includes(query));
  const pages=Math.max(1,Math.ceil(rows.length/20)),page=Math.max(0,Math.min(pages-1,s.previewPage||0));s.previewPage=page;
  const mess=db.session.channel==='MESS';
  const columns=mess?['Mã','Mess','Contact','Đơn','DTKT']:['Mã','Contact','Đơn','DT khởi tạo'];
  const values=row=>mess?[row.code,fmt(row.mess),fmt(row.contacts),fmt(row.orders),fmt(row.revenue)]:[row.code,fmt(row.contacts),fmt(row.orders),fmt(row.revenue)];
  const cols=mess?'<colgroup><col style="width:36%"><col style="width:11%"><col style="width:16%"><col style="width:9%"><col style="width:28%"></colgroup>':'';
  return `<div class="crm-api-preview-scroll"><table${mess?' class="crm-api-mess-preview"':''}>${cols}<thead><tr>${columns.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.slice(page*20,page*20+20).map(row=>`<tr>${values(row).map((x,i)=>`<td${i===0?' class="crm-api-code"':''}>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>${!rows.length?`<p class="crm-api-empty">${s.cache?'Không có mã phù hợp.':'Mã sẽ hiện ở đây sau khi lấy CRM.'}</p>`:''}</div>${pages>1?`<div class="crm-api-preview-pager"><span>${rows.length} mã</span>${btn('crm-api-preview-page','‹',{delta:-1})}<span>${page+1}/${pages}</span>${btn('crm-api-preview-page','›',{delta:1})}</div>`:''}`;
}
function crmApiPreview(d){const s=crmApiState();return `<div class="crm-api-preview"><div class="crm-api-preview-head"><b>${s.cache&&!crmApiReady()?'Mã lần lấy trước':'Mã đã lấy'}</b><input type="search" data-crm-api-search value="${esc(s.previewQuery||'')}" placeholder="Tìm mã…" aria-label="Tìm mã CRM đã lấy"></div><div class="crm-api-preview-results">${crmApiPreviewResults(d)}</div></div>`;}
function crmApiSourceCard(d){
  const s=crmApiState(),c=crmApiConfig(),busy=crmApiPending.has(crmApiScope()),manual=s.source!=='api';
  const controls=`<div class="crm-api-source-switch">${btn('crm-api-source','API CRM',{source:'api'},!manual?'primary':'')}${btn('crm-api-source','Dán/File',{source:'manual'},manual?'primary':'')}${btn('crm-api-config','⚙ Nhân sự')}</div>`;
  const body=manual?`<div class="drop-zone" data-drop-kind="crm"><span>Kéo thả <b>file CRM</b> (<code>.xlsx, .csv, .tsv</code>)</span>${btn('file','+ Chọn file',{kind:'crm'},'primary')}</div>${field('report',['crmPaste'],report().crmPaste,'textarea','rows="4" placeholder="Paste trực tiếp bảng CRM…"')}`:
  `<button type="button" class="crm-api-range-trigger" data-action="crm-api-open-range" aria-haspopup="dialog" aria-label="Chọn khoảng ngày CRM"><span>▦</span><span>${s.startDate&&s.endDate?crmApiDateLabel(s.startDate)+' – '+crmApiDateLabel(s.endDate):'Chọn khoảng ngày'}</span><span>▾</span></button><div class="crm-api-actions">${btn('crm-api-period','BC Thứ 2',{period:'monday'})}${btn('crm-api-period','BC Thứ 5',{period:'thursday'})}<button type="button" class="btn primary" data-action="crm-api-load" ${busy?'disabled':''}>${busy?'Đang lấy…':'Lấy CRM'}</button></div><div class="crm-api-status ${s.error?'crm-api-error':''}" role="status" aria-live="polite">${esc(busy?'Đang lấy toàn bộ dữ liệu…':s.error||(!c.names.length?'Chọn nhân sự tại ⚙.':s.cache?((crmApiReady()?'Đã lấy ':'Cần lấy lại · ')+s.cache.totalRows+'/'+s.cache.totalRows+' dòng · '+crmApiDateLabel(s.cache.startDate)+'–'+crmApiDateLabel(s.cache.endDate)):'Chọn khoảng ngày rồi bấm Lấy CRM.'))}</div>${crmApiPreview(d)}${s.cache?`<details class="crm-api-details"><summary>${esc(c.names.join(' · '))} · ${esc(new Date(s.cache.loadedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))}</summary><small>${s.cache.pages} lượt dữ liệu · ${s.cache.totalRows} dòng đã đối chiếu tổng</small></details>`:''}`;
  return card('2. Nguồn CRM',`<section id="crm-api-panel" data-crm-ui="range-v3">${controls}${body}</section>`,`<span class="count-pill">${d.crm.length} mã</span>`).replace('<section class="card">','<section id="crm-api-source-card" class="card crm-api-card">');
}
async function crmApiOpenConfig(){
  const scope=crmApiScope(),epoch=crmApiEpoch,res=await crmApiSend('CONFIG');if(scope!==crmApiScope()||epoch!==crmApiEpoch)return;
  const c=crmApiConfig(),options=res.mappings;
  if(!Array.isArray(options)||!options.length)throw Error('Lưu tên CRM trong Cài đặt Extension trước.');
  openModal('Nhân sự CRM',`<div id="crm-api-person-list">${options.map((m,i)=>`<label class="check-pill"><input type="checkbox" data-crm-api-person value="${esc(m.crmName)}" ${c.names.includes(m.crmName)?'checked':''}>${esc(m.crmName)}${m.sheetTab?` · ${esc(m.sheetTab)}`:''}</label>`).join('')}</div>`,btn('crm-api-save-config','Lưu',{},'primary'));
  document.querySelector('#crm-api-person-list').dataset.scope=scope;
}
function crmApiSaveConfig(){
  const box=document.querySelector('#crm-api-person-list');if(!box||box.dataset.scope!==crmApiScope())throw Error('Hồ sơ đã đổi. Mở lại cấu hình CRM.');
  const names=Array.from(box.querySelectorAll('[data-crm-api-person]:checked'),el=>el.value);
  if(!names.length)throw Error('Chọn ít nhất một nhân sự CRM.');
  const c=crmApiConfig();c.names=[...new Set(names)];c.resolved=[];crmApiState().error='';crmApiInvalidate();closeModal();save();render();
}
function crmApiTSV(res){
  if(!Array.isArray(res.rows)||res.rows.length!==res.totalRows)throw Error('Chưa nhận đủ chi tiết CRM.');
  const headers=['Mã','Master_id','Số hội thoại','Số contact','Số đơn','DT khởi tạo'];
  const lines=res.rows.map(row=>[row.code,row.code,row.mess,row.contacts,row.orders,row.revenue]);
  for(const line of lines){if(typeof line[0]!=='string'||!line[0].trim())throw Error('CRM thiếu mã.');for(const n of line.slice(2))if(!Number.isSafeInteger(Number(n))||Number(n)<0)throw Error('CRM trả chỉ số chưa hợp lệ.');}
  return [headers,...lines].map(line=>line.map(tsvCell).join('\t')).join('\n');
}
async function crmApiLoad(){
  const state=crmApiState(),cfg=crmApiConfig(),scope=crmApiScope();
  if(crmApiPending.has(scope))return;
  if(state.source!=='api')throw Error('Chọn API CRM trước.');
  if(!cfg.names.length){await crmApiOpenConfig();return;}
  for(const v of [state.startDate,state.endDate]){const n=new Date(v+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(n.getTime())||n.toISOString().slice(0,10)!==v)throw Error('Chọn đủ khoảng ngày hợp lệ.');}
  if(state.startDate>state.endDate||state.endDate>crmApiToday())throw Error('Khoảng ngày không hợp lệ.');
  const ticket=++crmApiEpoch,signature=crmApiSignature(),profile=user().id,channel=db.session.channel;
  crmApiPending.set(scope,ticket);state.error='';reportCache=null;render();
  try{
    const res=await crmApiSend('FETCH',{profile,channel,names:[...cfg.names],startDate:state.startDate,endDate:state.endDate});
    if(ticket!==crmApiEpoch||scope!==crmApiScope()||signature!==crmApiSignature()||state!==crmApiState())return;
    if(res.profile!==profile||res.channel!==channel||res.startDate!==state.startDate||res.endDate!==state.endDate)throw Error('Kết quả CRM không thuộc bộ lọc hiện tại.');
    const tsv=crmApiTSV(res);
    state.cache={signature,tsv,startDate:res.startDate,endDate:res.endDate,totalRows:res.totalRows,pages:res.pages,loadedAt:res.loadedAt};state.previewPage=0;
    cfg.resolved=res.users.map(u=>({id:u.id,crmName:u.crmName}));state.error='';save();
  }catch(e){if(ticket===crmApiEpoch&&scope===crmApiScope()){state.error=e.message||'Chưa đọc được CRM.';save();}}
  finally{if(crmApiPending.get(scope)===ticket)crmApiPending.delete(scope);reportCache=null;if(scope===crmApiScope()&&ui.view==='report')render();}
}
const crmApiOriginalReportData=reportData;
reportData=function(){const d=crmApiOriginalReportData();if(crmApiState().source==='api'&&!crmApiReady()&&!d.pre.errors.some(e=>e.code==='CRM_API_NOT_READY')){d.pre.errors.push({code:'CRM_API_NOT_READY',title:'CRM chưa sẵn sàng',detail:crmApiState().error||'Bấm Lấy CRM cho đúng ngày và nhân sự đang chọn.',traces:[]});d.ready=false;}return d;};
window.SieuOffline.reportData=reportData;
const crmApiOriginalPerform=perform;
perform=async function(action,a={},el){
  if(action==='crm-api-open-range')return crmApiRangeOpen();
  if(action==='crm-api-range-nav'){if(crmApiRangeDraft){crmApiRangeDraft.month=crmApiRangeMonth(crmApiRangeDraft.month,Number(a.delta)>0?1:-1);crmApiRangeRender();}return;}
  if(action==='crm-api-range-day')return crmApiRangeDay(a.day);
  if(action==='crm-api-range-apply')return crmApiRangeApply();
  if(action==='crm-api-range-cancel')return crmApiRangeClose();
  if(action==='view')crmApiRangeClose();
  if(action==='crm-api-source'){const s=crmApiState();s.source=a.source==='api'?'api':'manual';s.error='';crmApiInvalidate();save();render();return;}
  if(action==='crm-api-period'){crmApiSetReportPeriod(a.period);return;}
  if(action==='crm-api-config')return crmApiOpenConfig();
  if(action==='crm-api-save-config')return crmApiSaveConfig();
  if(action==='crm-api-load')return crmApiLoad();
  if(action==='crm-api-preview-page'){const s=crmApiState();s.previewPage=Math.max(0,(s.previewPage||0)+(Number(a.delta)>0?1:-1));render();return;}
  if(['export-report','copy-report','export-report-tsv'].includes(action)&&!crmApiReady())throw Error('CRM chưa sẵn sàng. Lấy lại dữ liệu trước khi xuất.');
  return crmApiOriginalPerform(action,a,el);
};
document.addEventListener('click',e=>{if(crmApiRangeDraft&&!e.target.closest?.('#crm-api-range-popup,[data-action="crm-api-open-range"]'))crmApiRangeClose();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&crmApiRangeDraft){e.preventDefault();crmApiRangeClose();document.querySelector('[data-action="crm-api-open-range"]')?.focus();}});
document.addEventListener('input',e=>{if(!e.target.matches?.('[data-crm-api-search]'))return;const s=crmApiState();s.previewQuery=e.target.value;s.previewPage=0;const target=document.querySelector('#crm-api-panel .crm-api-preview-results');if(target)target.innerHTML=crmApiPreviewResults(reportData());});
// No polling, no fetch on render, date input or route changes.
