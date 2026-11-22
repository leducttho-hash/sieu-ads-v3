/* Runs inside the existing app closure, only in the generated OAuth pilot. */
const CRM_BRIDGE_ID='mopcgklafblfklmngbhccfonefidcajf';
const CRM_BRIDGE_TYPE='SIEUADS_PILOT_CRM_V1';
let crmApiEpoch=0;
const crmApiPending=new Map();
function crmApiScope(){return JSON.stringify([user().id,wh().id,db.session.channel]);}
function crmApiState(){const r=report();r.crmApiInputsV1??={};const sk=crmApiScope();return r.crmApiInputsV1[sk]??={source:'manual',startDate:'',endDate:'',cache:null};}
function crmApiConfig(){db.crmApiProfilesV1??={};const k=JSON.stringify([user().id,db.session.channel]);return db.crmApiProfilesV1[k]??={names:[],resolved:[]};}
function crmApiSignature(s=crmApiState(),c=crmApiConfig()){return JSON.stringify([crmApiScope(),s.startDate,s.endDate,[...c.names].sort()]);}
function crmApiReady(){const s=crmApiState();return s.source!=='api'||!!s.cache&&s.cache.signature===crmApiSignature()&&!s.error&&!crmApiPending.has(crmApiScope());}
function crmApiInputText(r){const s=crmApiState();return s.source==='api'?(s.cache?.tsv||''):r.crmPaste;}
function crmApiInvalidate(){crmApiEpoch++;}
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
function crmApiSetDays(days){const s=crmApiState();s.endDate||=dateParts().iso;const end=new Date(s.endDate+'T00:00:00Z');if(!Number.isFinite(end.getTime()))throw Error('Chọn Đến ngày hợp lệ.');end.setUTCDate(end.getUTCDate()-(days-1));s.startDate=end.toISOString().slice(0,10);s.error='';crmApiInvalidate();save();render();}
function crmApiSourceCard(d){
  const s=crmApiState(),c=crmApiConfig(),busy=crmApiPending.has(crmApiScope()),manual=s.source!=='api';
  const controls=`<div class="crm-api-source-switch">${btn('crm-api-source','Dán/File',{source:'manual'},manual?'primary':'')}${btn('crm-api-source','API CRM',{source:'api'},!manual?'primary':'')}${btn('crm-api-config','⚙ Nhân sự')}</div>`;
  const body=manual?`<div class="drop-zone" data-drop-kind="crm"><span>Kéo thả <b>file CRM</b> (<code>.xlsx, .csv, .tsv</code>)</span>${btn('file','+ Chọn file',{kind:'crm'},'primary')}</div>${field('report',['crmPaste'],report().crmPaste,'textarea','rows="4" placeholder="Paste trực tiếp bảng CRM…"')}`:
  `<div class="crm-api-dates"><label>Từ ngày<input type="date" data-crm-api-date="startDate" value="${esc(s.startDate)}" max="${esc(dateParts().iso)}"></label><label>Đến ngày<input type="date" data-crm-api-date="endDate" value="${esc(s.endDate)}" max="${esc(dateParts().iso)}"></label></div><div class="crm-api-actions">${btn('crm-api-days','4 ngày',{days:4})}${btn('crm-api-days','7 ngày',{days:7})}<button type="button" class="btn primary" data-action="crm-api-load" ${busy?'disabled':''}>${busy?'Đang lấy…':'Lấy CRM'}</button></div><div class="crm-api-status" role="status" aria-live="polite">${esc(busy?'Đang lấy toàn bộ dữ liệu…':s.error||(!c.names.length?'Chọn nhân sự tại ⚙.':s.cache?((crmApiReady()?'Đã lấy ':'Cần lấy lại · ')+s.cache.totalRows+'/'+s.cache.totalRows+' dòng · '+crmApiDateLabel(s.cache.startDate)+'–'+crmApiDateLabel(s.cache.endDate)):'Chọn ngày rồi bấm Lấy CRM.'))}</div>${s.cache?`<details class="crm-api-details"><summary>${esc(c.names.join(' · '))} · ${esc(new Date(s.cache.loadedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))}</summary><small>${s.cache.pages} lượt dữ liệu · ${s.cache.totalRows} dòng đã đối chiếu tổng</small></details>`:''}`;
  return card('2. Nguồn CRM',`<section id="crm-api-panel">${controls}${body}</section>`,`<span class="count-pill">${d.crm.length} mã</span>`);
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
  if(state.startDate>state.endDate||state.endDate>dateParts().iso)throw Error('Khoảng ngày không hợp lệ.');
  const ticket=++crmApiEpoch,signature=crmApiSignature(),profile=user().id,channel=db.session.channel;
  crmApiPending.set(scope,ticket);state.error='';reportCache=null;render();
  try{
    const res=await crmApiSend('FETCH',{profile,channel,names:[...cfg.names],startDate:state.startDate,endDate:state.endDate});
    if(ticket!==crmApiEpoch||scope!==crmApiScope()||signature!==crmApiSignature()||state!==crmApiState())return;
    if(res.profile!==profile||res.channel!==channel||res.startDate!==state.startDate||res.endDate!==state.endDate)throw Error('Kết quả CRM không thuộc bộ lọc hiện tại.');
    const tsv=crmApiTSV(res);
    state.cache={signature,tsv,startDate:res.startDate,endDate:res.endDate,totalRows:res.totalRows,pages:res.pages,loadedAt:res.loadedAt};
    cfg.resolved=res.users.map(u=>({id:u.id,crmName:u.crmName}));state.error='';save();
  }catch(e){if(ticket===crmApiEpoch&&scope===crmApiScope()){state.error=e.message||'Chưa đọc được CRM.';save();}}
  finally{if(crmApiPending.get(scope)===ticket)crmApiPending.delete(scope);reportCache=null;if(scope===crmApiScope()&&ui.view==='report')render();}
}
const crmApiOriginalReportData=reportData;
reportData=function(){const d=crmApiOriginalReportData();if(crmApiState().source==='api'&&!crmApiReady()&&!d.pre.errors.some(e=>e.code==='CRM_API_NOT_READY')){d.pre.errors.push({code:'CRM_API_NOT_READY',title:'CRM chưa sẵn sàng',detail:crmApiState().error||'Bấm Lấy CRM cho đúng ngày và nhân sự đang chọn.',traces:[]});d.ready=false;}return d;};
window.SieuOffline.reportData=reportData;
const crmApiOriginalPerform=perform;
perform=async function(action,a={},el){
  if(action==='crm-api-source'){const s=crmApiState();s.source=a.source==='api'?'api':'manual';s.error='';crmApiInvalidate();save();render();return;}
  if(action==='crm-api-days'){crmApiSetDays(Number(a.days)===4?4:7);return;}
  if(action==='crm-api-config')return crmApiOpenConfig();
  if(action==='crm-api-save-config')return crmApiSaveConfig();
  if(action==='crm-api-load')return crmApiLoad();
  if(['export-report','copy-report','export-report-tsv'].includes(action)&&!crmApiReady())throw Error('CRM chưa sẵn sàng. Lấy lại dữ liệu trước khi xuất.');
  return crmApiOriginalPerform(action,a,el);
};
document.addEventListener('input',e=>{const k=e.target.dataset?.crmApiDate;if(!['startDate','endDate'].includes(k))return;const s=crmApiState();s[k]=e.target.value;s.error='';crmApiInvalidate();save();reportCache=null;const status=document.querySelector('#crm-api-panel .crm-api-status');if(status)status.textContent='Bấm Lấy CRM để dùng khoảng ngày mới.';});
// No polling, no fetch on render, date input or route changes.
