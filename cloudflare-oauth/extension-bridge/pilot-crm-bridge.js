/* Pilot-only, read-only bridge. Never returns credentials or accepts URLs. */
(() => {
  'use strict';
  const ORIGIN = 'https://sieuads-oauth-pilot.leducttho.workers.dev';
  const TYPE = 'SIEUADS_PILOT_CRM_V1';
  const CD = ['numberOfContacts','numberOfProcessContacts','numberOfOrders','initTurnOver','successTurnOver'];
  const MESS = ['conversation_count','phone_conversion_count','init_order_count','success_order_count','init_revenue','success_revenue'];
  let busy = false;
  function check(ok, message) { if (!ok) throw new Error(message); }
  function int(v, field) {
    check((typeof v === 'number' || typeof v === 'string') && /^\d+$/.test(String(v)), 'CRM thiếu hoặc sai ' + field + '.');
    const n = Number(v); check(Number.isSafeInteger(n), 'CRM vượt giới hạn ' + field + '.'); return n;
  }
  function text(v, field) { check(typeof v === 'string' && !!v.trim() && !/[\r\n\t\0]/.test(v), 'CRM thiếu hoặc sai ' + field + '.'); return v.trim(); }
  function range(m) {
    for (const k of ['startDate','endDate']) {
      check(typeof m[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m[k]), 'Chọn đủ khoảng ngày.');
      const d = new Date(m[k] + 'T00:00:00Z'); check(Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === m[k], 'Ngày không hợp lệ.');
    }
    check(m.startDate <= m.endDate && m.endDate <= getVnYmdOffset(0), 'Khoảng ngày không hợp lệ.');
    check((Date.parse(m.endDate)-Date.parse(m.startDate))/86400000 < 366, 'Chọn tối đa 366 ngày mỗi lần.');
  }
  async function savedMappings() {
    const data = await chrome.storage.local.get('mappings');
    const list = Array.isArray(data.mappings) ? data.mappings : [];
    const byName = new Map();
    for (const m of list) if (m && typeof m.crmName === 'string' && m.crmName.trim()) {
      const crmName = text(m.crmName, 'Tên CRM'), k = normalizeKey(crmName);
      if (!byName.has(k)) byName.set(k, {crmName, sheetTab:String(m.sheetTab || '').slice(0,100)});
    }
    return [...byName.values()];
  }
  async function json(url, token) {
    let r;
    try { r = await fetch(url, {method:'GET', redirect:'error', signal:AbortSignal.timeout(25000), headers:{accept:'application/json', authorization:'Bearer '+token, language:'en'}}); }
    catch (_) { throw new Error('Chưa đọc được CRM. Kiểm tra mạng và đăng nhập rồi thử lại.'); }
    check(r.ok, r.status === 401 || r.status === 403 ? 'Đăng nhập lại đúng tài khoản trên CRM rồi bấm Lấy CRM.' : 'CRM trả HTTP '+r.status+'. Chưa cập nhật báo cáo.');
    // Bound decoded bytes, including responses without Content-Length.
    check(Number(r.headers.get('Content-Length') || 0) <= 8*1024*1024, 'Phản hồi CRM quá lớn.');
    const reader = r.body.getReader(); const decoder = new TextDecoder(); let raw='', size=0;
    try { for (;;) { const part=await reader.read(); if(part.done) break; size+=part.value.byteLength; check(size<=8*1024*1024,'Phản hồi CRM quá lớn.'); raw+=decoder.decode(part.value,{stream:true}); } raw+=decoder.decode(); }
    catch(e) { await reader.cancel().catch(()=>{}); throw e; } finally { reader.releaseLock(); }
    let j; try { j=JSON.parse(raw); } catch (_) { throw new Error('CRM chưa trả JSON hợp lệ.'); }
    check(j && j.code === 200 && j.data && typeof j.data === 'object', 'CRM chưa trả báo cáo thành công.'); return j;
  }
  function sums(rows, fields) { const out=Object.fromEntries(fields.map(k=>[k,0])); for (const r of rows) for(const k of fields) {out[k]+=int(r[k],k);check(Number.isSafeInteger(out[k]),'Tổng CRM vượt giới hạn.');} return out; }
  function reconcile(rows, total, fields) { const got=sums(rows,fields); for(const k of fields) check(got[k] === int(total?.[k],k), 'Tổng chi tiết CRM không khớp '+k+'. Bấm Lấy CRM để thử lại.'); return got; }
  async function resolvedNames(mappings, m, session) {
    const cacheKey='pilotCrmIdentityV1', data=await chrome.storage.local.get(cacheKey), cached=data[cacheKey];
    let users;
    try { users=await resolveUserIdsForContentReport(mappings,m.startDate,m.endDate,session.token); }
    catch(e) {
      // Previously verified IDs may represent no activity, only in the SAME CRM session.
      if(cached?.sessionKey !== session.sessionKey || !mappings.every(x=>cached.people?.[normalizeKey(x.crmName)])) throw e;
      users=mappings.map(x=>({...x,id:cached.people[normalizeKey(x.crmName)]}));
    }
    check(users.length > 0 && new Set(users.map(x=>x.id)).size === users.length, 'Cấu hình nhân sự CRM bị trùng.');
    return users;
  }
  async function cd(m, users, session) {
    const ids=new Set(users.map(x=>x.id)), rows=[], levelTotals=[];
    for(const level of [SCHOOL_LEVEL_THCS,SCHOOL_LEVEL_TIEU_HOC]) {
      const q=new URLSearchParams();q.append('createdAt[]',m.startDate);q.append('createdAt[]',m.endDate);
      for(const id of ids) q.append('userIds[]',String(id));q.set('schoolLevelId',String(level));q.set('codeSource','');
      const j=await json(CRM_CONTENT_API_BASE+'?'+q,session.token), list=j.data.contentData;
      check(Array.isArray(list),'CRM thiếu contentData.');
      const raw=[],seen=new Set(),people=new Set();
      for(const p of list) {
        const id=int(p.id,'id');check(ids.has(id) && !people.has(id),'CRM trả sai hoặc trùng nhân sự.');people.add(id);
        check(Array.isArray(p.codeSources),'CRM thiếu codeSources.');
        for(const r of p.codeSources) {
          const code=text(r.codeSource,'codeSource'), k=id+'|'+code;check(!seen.has(k),'CRM trả trùng dòng mã trong cùng cấp học.');seen.add(k);
          for(const f of CD) int(r[f],f);raw.push(r);
          rows.push({personId:id,schoolLevelId:level,code,contacts:r.numberOfContacts,processed:r.numberOfProcessContacts,orders:r.numberOfOrders,revenue:r.initTurnOver,successRevenue:r.successTurnOver,mess:0});
        }
      }
      levelTotals.push({schoolLevelId:level,...reconcile(raw,j.data.total,CD)});
    }
    return {rows, pages:2, totalRows:rows.length, totals:levelTotals};
  }
  function messMeta(j, page, requestedLimit) {
    const meta=j.data.metaData;
    check(meta && typeof meta==='object' && !Array.isArray(meta),'CRM thiếu thông tin phân trang MESS.');
    // Page echoes are protocol metadata, not financial metrics. Some CRM responses
    // omit them. The requested page drives traversal; count, uniqueness and totals
    // independently prove completeness. An explicit contradictory echo still fails.
    const optionalInt=(value,field)=>{
      if(value===undefined||value===null||value==='')return null;
      const raw=typeof value==='string'?value.trim():value;
      check((typeof raw==='number'||typeof raw==='string') && /^\d+(?:\.0+)?$/.test(String(raw)),'CRM sai thông tin phân trang '+field+'.');
      return int(Number(raw),field);
    };
    const values=(object,keys)=>keys.filter(k=>Object.hasOwn(object,k)).map(k=>[k,optionalInt(object[k],k)]).filter(x=>x[1]!==null);
    const echo=values(meta,['page','currentPage','current_page']);
    check(echo.every(([,n])=>n===page),'CRM trả sai trang MESS.');
    const limits=values(meta,['limit','perPage','per_page']);
    const limit=limits[0]?.[1]??requestedLimit;
    check(limit>0 && limit<=requestedLimit && limits.every(([,n])=>n===limit),'CRM trả sai số dòng mỗi trang MESS.');
    const totals=[...values(meta,['total']),...values(j,['totalItem'])];
    check(totals.length>0 && totals.every(([,n])=>n===totals[0][1]),'CRM thiếu hoặc mâu thuẫn tổng số dòng MESS.');
    const total=totals[0][1],pages=Math.ceil(total/limit),pageCounts=values(meta,['totalPage','totalPages','last_page']);
    check(pages<=200 && pageCounts.every(([,n])=>n===pages||(total===0&&n===1)),'Phân trang MESS chưa nhất quán hoặc quá lớn.');
    check(Array.isArray(j.data.data),'CRM thiếu chi tiết MESS.');
    return {total,pages,limit};
  }
  async function mess(m, users, session) {
    const ids=new Set(users.map(x=>x.id)), raw=[], rows=[], seen=new Set(),deadline=Date.now()+180000;let first, signature;
    for(let page=1;page <= (first?.pages || 1);page++) {
      check(Date.now()<deadline,'CRM tải quá lâu. Chưa cập nhật báo cáo.');
      const requestedLimit=first?.limit||50;
      const q=new URLSearchParams({page:String(page),limit:String(requestedLimit),date_from:m.startDate,date_to:m.endDate,sort_by:'conversation_count',sort_dir:'desc'});
      for(const id of ids)q.append('marketer_id[]',String(id));
      // /report is the aggregate contract used by the existing daily/slot flows.
      // Pilot needs the paginated detail contract, verified from CRM Network URLs.
      const j=await json(CRM_MESS_API_BASE+'/rows?'+q,session.token), meta=messMeta(j,page,requestedLimit);
      const total=Object.fromEntries(MESS.map(k=>[k,int(j.data.totalReport?.[k],k)]));
      const sig=JSON.stringify({meta,total});if(!first){first=meta;signature=sig;}else check(sig===signature,'CRM thay đổi tổng trong lúc tải các trang. Bấm Lấy CRM để thử lại.');
      const expected=Math.max(0,Math.min(first.limit,first.total-(page-1)*first.limit));check(j.data.data.length===expected,'Thiếu dòng trong trang MESS '+page+'.');
      for(const r of j.data.data) {
        const id=int(r.marketer_id,'marketer_id');check(ids.has(id),'CRM trả MESS của nhân sự ngoài cấu hình.');
        const code=text(r.master_id,'master_id'), content=text(r.content_id,'content_id'), fanpage=text(r.fanpage_name,'fanpage_name');
        const k=JSON.stringify([id,fanpage,code,content]);check(!seen.has(k),'CRM trả trùng dòng giữa các trang MESS.');seen.add(k);
        for(const f of MESS)int(r[f],f);raw.push(r);
        rows.push({personId:id,code,contentId:content,fanpage,mess:r.conversation_count,contacts:r.phone_conversion_count,orders:r.init_order_count,revenue:r.init_revenue,successRevenue:r.success_revenue,successOrders:r.success_order_count});
      }
    }
    check(raw.length===first.total,'Chưa lấy đủ toàn bộ MESS.');
    const totals=reconcile(raw,JSON.parse(signature).total,MESS);
    return {rows,pages:first.pages,totalRows:first.total,totals};
  }
  async function handle(message, sender) {
    const url=new URL(sender?.url || 'about:blank');
    check(url.origin===ORIGIN && (sender.origin===undefined || sender.origin===ORIGIN) && (sender.frameId===undefined || sender.frameId===0),'Trang không được phép kết nối CRM.');
    check(message?.type===TYPE && ['CONFIG','FETCH'].includes(message.op),'Thao tác CRM không hợp lệ.');
    const allowed=await savedMappings();
    if(message.op==='CONFIG')return {ok:true,version:1,mappings:allowed};
    range(message);check(['CD','MESS'].includes(message.channel),'Kênh CRM không hợp lệ.');
    check(typeof message.profile==='string' && /^[\w-]{1,64}$/.test(message.profile),'Hồ sơ CRM không hợp lệ.');
    check(Array.isArray(message.names) && message.names.length>0 && message.names.length<=20,'Chọn nhân sự CRM.');
    const requested=new Set(message.names.map(x=>normalizeKey(text(x,'Tên CRM'))));
    const mappings=allowed.filter(x=>requested.has(normalizeKey(x.crmName)));
    check(mappings.length===requested.size,'Nhân sự chưa được lưu trong Cài đặt Extension CRM trên máy này.');
    check(!busy,'Một lần lấy CRM đang chạy. Đợi hoàn tất rồi thử lại.');busy=true;
    try {
      const session=await contentScaleReadSession(), users=await resolvedNames(mappings,message,session);
      const result=message.channel==='CD'?await cd(message,users,session):await mess(message,users,session);
      const current=await contentScaleReadSession();check(current.sessionKey===session.sessionKey,'Phiên CRM đã đổi. Chưa dùng kết quả; bấm Lấy CRM lại.');
      const people={}; for(const u of users) people[normalizeKey(u.crmName)]=u.id;
      await chrome.storage.local.set({pilotCrmIdentityV1:{sessionKey:session.sessionKey,people}});
      return {ok:true,profile:message.profile,channel:message.channel,startDate:message.startDate,endDate:message.endDate,users:users.map(u=>({id:u.id,crmName:u.crmName})),loadedAt:new Date().toISOString(),...result};
    } finally {busy=false;}
  }
  chrome.runtime.onMessageExternal.addListener((message,sender,reply)=>{
    if(message?.type!==TYPE)return false;
    handle(message,sender).then(reply).catch(e=>reply({ok:false,error:e.message || 'Chưa đọc được CRM.'}));return true;
  });
  if(typeof globalThis.__PILOT_CRM_TEST__ === 'function')globalThis.__PILOT_CRM_TEST__({handle,cd,mess,range,reconcile,int});
})();
