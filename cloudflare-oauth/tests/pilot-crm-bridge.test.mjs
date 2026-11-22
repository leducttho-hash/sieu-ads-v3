import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const bridge=readFileSync(new URL('../extension-bridge/pilot-crm-bridge.js',import.meta.url),'utf8');
const panel=readFileSync(new URL('../crm-api-panel.js',import.meta.url),'utf8');
const origin='https://sieuads-oauth-pilot.leducttho.workers.dev';
function mock(change){
 let api;const calls=[];
 const rows=Array.from({length:135},(_,i)=>({marketer_id:1,marketer_name:'Tester',fanpage_name:'Page',master_id:i%2?'ABC-L12':'ABC8B-PXN',content_id:String(120000000000000000n+BigInt(i)),conversation_count:1,phone_conversion_count:1,init_order_count:0,success_order_count:0,init_revenue:0,success_revenue:0}));
 const total={conversation_count:135,phone_conversion_count:135,init_order_count:0,success_order_count:0,init_revenue:0,success_revenue:0};
 const ctx=vm.createContext({URL,URLSearchParams,Date,TextDecoder,AbortSignal,Map,Set,Number,JSON,
  chrome:{runtime:{onMessageExternal:{addListener(){}}},storage:{local:{get:async()=>({mappings:[{crmName:'Tester',sheetTab:'Test'}]}),set:async()=>{}}}},
  getVnYmdOffset:()=> '2026-11-22',normalizeKey:x=>String(x).trim().toLowerCase(),contentScaleReadSession:async()=>({token:'never-expose-this',sessionKey:'test-session'}),resolveUserIdsForContentReport:async()=>[{id:1,crmName:'Tester'}],
  SCHOOL_LEVEL_THCS:5,SCHOOL_LEVEL_TIEU_HOC:1,CRM_CONTENT_API_BASE:'https://crm.test/content',CRM_MESS_API_BASE:'https://crm.test/mess',
  fetch:async(url,opts)=>{calls.push({url,opts});const page=Number(new URL(url).searchParams.get('page'));const j={code:200,data:{data:structuredClone(rows.slice((page-1)*50,page*50)),totalReport:{...total},metaData:{total:135,page,limit:50,totalPage:3}},totalItem:135};if(change)change(j,page);return new Response(JSON.stringify(j));},__PILOT_CRM_TEST__:v=>api=v});
 vm.runInContext(bridge,ctx);
 return {api,calls,message:{type:'SIEUADS_PILOT_CRM_V1',op:'FETCH',profile:'Test',channel:'MESS',startDate:'2026-11-15',endDate:'2026-11-21',names:['Tester']},sender:{url:origin+'/',origin,frameId:0}};
}
test('Pilot CRM bridge loads all pages, reconciles and never exposes credentials',async()=>{const f=mock(),r=await f.api.handle(f.message,f.sender);assert.equal(r.totalRows,135);assert.equal(r.rows.length,135);assert.equal(r.totals.conversation_count,135);assert.equal(f.calls.length,3);assert(!JSON.stringify(r).includes('never-expose-this'));assert.equal(r.rows[0].contentId,'120000000000000000');assert.equal(r.rows[0].code,'ABC8B-PXN');});
test('Pilot CONFIG never calls CRM and only returns configured names',async()=>{const f=mock(),r=await f.api.handle({...f.message,op:'CONFIG'},f.sender);assert.equal(r.mappings.length,1);assert.equal(f.calls.length,0);});
test('Pilot origin and iframe boundaries reject before network',async()=>{for(const sender of [{url:'https://evil.test/'},{url:origin+'/',origin,frameId:1}]){const f=mock();await assert.rejects(f.api.handle(f.message,sender));assert.equal(f.calls.length,0);}});
test('Pilot rejects arbitrary names and operations',async()=>{for(const patch of [{names:['Other']},{op:'PROXY'},{channel:'WRITE'},{endDate:'2027-01-01'}]){const f=mock();await assert.rejects(f.api.handle({...f.message,...patch},f.sender));assert.equal(f.calls.length,0);}});
for(const [name,change] of [
 ['missing page row',(j,p)=>{if(p===2)j.data.data.pop();}],
 ['wrong page',(j,p)=>{if(p===2)j.data.metaData.page=1;}],
 ['summary drift',(j,p)=>{if(p===2)j.data.totalReport.conversation_count++;}],
 ['bad total',(j)=>{j.data.totalReport.conversation_count++;}],
 ['missing metric',(j)=>{delete j.data.data[0].init_revenue;}],
 ['wrong person',(j)=>{j.data.data[0].marketer_id=99;}],
 ['numeric ID',(j)=>{j.data.data[0].content_id=120000000000000000;}],
])test('Pilot rejects '+name+' rather than accepting partial report',async()=>{const f=mock(change);await assert.rejects(f.api.handle(f.message,f.sender));});
function ui(){let r={crmPaste:'manual'},person={id:'A'},warehouse={id:'W1'};const ctx=vm.createContext({window:{SieuOffline:{}},document:{addEventListener(){}},db:{session:{channel:'CD'}},report:()=>r,user:()=>person,wh:()=>warehouse,reportData:()=>({pre:{errors:[]},ready:true}),perform:()=>{},dateParts:()=>({iso:'2026-11-21'}),save(){},render(){},reportCache:null,Map,Set,Date,JSON,Number,String,Array});vm.runInContext(panel,ctx);return {ctx,setPerson:id=>person={id},setWarehouse:id=>warehouse={id}};}
test('Pilot date shortcuts count inclusively and never fetch',()=>{const {ctx}=ui();vm.runInContext("crmApiState().endDate='2026-11-21';crmApiSetDays(4)",ctx);assert.equal(ctx.crmApiState().startDate,'2026-11-18');ctx.crmApiSetDays(7);assert.equal(ctx.crmApiState().startDate,'2026-11-15');});
test('Pilot API cache is isolated by user, warehouse and channel; manual remains unchanged',()=>{const f=ui(),a=f.ctx.crmApiState();a.cache={tsv:'saved'};f.setWarehouse('W2');assert.equal(f.ctx.crmApiState().cache,null);f.setWarehouse('W1');assert.equal(f.ctx.crmApiState().cache.tsv,'saved');f.setPerson('B');assert.equal(f.ctx.crmApiConfig().names.length,0);assert.equal(f.ctx.crmApiState().cache,null);assert.equal(f.ctx.crmApiInputText({crmPaste:'original'}),'original');});
