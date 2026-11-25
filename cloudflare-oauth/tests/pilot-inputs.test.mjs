import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const code=readFileSync(new URL('../pilot-inputs.js',import.meta.url),'utf8');
const crm=readFileSync(new URL('../crm-api-panel.js',import.meta.url),'utf8');
function fn(source,name){const m=new RegExp('^function '+name+'\\(','m').exec(source);assert(m,name);const rest=source.slice(m.index),line=rest.indexOf('\n'),next=rest.slice(line+1).search(/^(?:function |const |let |document\.|window\.)/m);return next<0?rest:rest.slice(0,line+1+next);}
function fixture(options={}){
  const state={previewPage:0,previewQuery:'',cache:{tsv:'unchanged'},startDate:'2026-11-15',endDate:'2026-11-21'},calls=[],events={},rows=Array.from({length:135},(_,i)=>({code:'QA'+i}));let scope='scope-A';
  const document={querySelectorAll:()=>[],querySelector:()=>null,getElementById:()=>null,addEventListener:(name,fn)=>events[name]=fn,body:{classList:{add(){}}}};
  const ctx=vm.createContext({console,Date,URL,encodeURIComponent,decodeURIComponent,setTimeout,clearTimeout,
    capture:()=>scope,ui:{view:'report',page:1,size:50},pendingImports:[],document,window:{addEventListener(){}},
    args:x=>encodeURIComponent(JSON.stringify(x)),esc:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    render:()=>calls.push('render'),perform:async(...x)=>{calls.push(x);return 'original-result'},pager:()=>'',
    selectFiles:options.selectFiles||(async()=>{}),confirmImport:options.confirmImport||(async p=>{ctx.pendingImports.splice(ctx.pendingImports.indexOf(p),1)}),
    crmApiPreviewResults:d=>{const count=d.crm.filter(r=>!state.previewQuery||r.code.includes(state.previewQuery)).length;state.previewPage=Math.min(state.previewPage,Math.max(1,Math.ceil(count/20))-1);return '<div class="crm-api-preview-scroll">TABLE</div>'+(count>20?'<div class="crm-api-preview-pager">OLD</div>':'')},
    crmApiState:()=>state,crmApiRangeDraft:null,crmApiRangeRender:()=>{},crmApiToday:()=> '2026-11-26',crmApiDateLabel:x=>x,
    reportData:()=>({crm:rows})});
  for(const name of ['crmApiShiftDay','crmApiRangeMonth'])vm.runInContext(fn(crm,name),ctx);
  vm.runInContext(code,ctx);
  return {ctx,state,calls,events,rows,setScope(value){scope=value;},getUploads:()=>vm.runInContext('[...pilotUiUploads.values()]',ctx)};
}
test('page windows keep the selected page, endpoints, unique valid targets and at most seven slots',()=>{
  const {ctx}=fixture();for(const total of [1,2,6,7,8,20,100,1000])for(let page=1;page<=total;page++){
    const slots=Array.from(ctx.pilotUiPageWindow(page,total)),numbers=slots.filter(Boolean);
    assert(slots.length<=7);assert(numbers.includes(page));assert.equal(numbers[0],1);assert.equal(numbers.at(-1),total);assert.equal(new Set(numbers).size,numbers.length);assert(numbers.every(n=>n>=1&&n<=total));
  }
});
test('table pagination sends the original page delta and preserves the row-size control',()=>{
  const {ctx}=fixture();ctx.ui.page=6;const html=ctx.pager(1000,20);assert(html.includes('data-ui="size"'));assert(html.includes('Trang 6/20'));assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  const match=html.match(/data-args="([^"]+)" aria-label="Trang 20"/);assert(match);assert.deepEqual(JSON.parse(decodeURIComponent(match[1])),{delta:14});
});
test('CRM pagination filters locally, clamps page boundaries and does not alter the cached payload',async()=>{
  const f=fixture(),before=JSON.stringify(f.state.cache);await f.ctx.perform('pilot-ui-crm-page',{page:7});assert.equal(f.state.previewPage,6);assert.deepEqual(f.calls,['render']);
  f.state.previewQuery='QA1';const html=f.ctx.crmApiPreviewResults({crm:f.rows});assert.equal((html.match(/crm-api-preview-pager/g)||[]).length,1);assert(!html.includes('OLD'));assert(html.includes('46 mã'));
  await f.ctx.perform('pilot-ui-crm-page',{page:999});assert.equal(f.state.previewPage,2);await f.ctx.perform('pilot-ui-crm-page',{page:0});assert.equal(f.state.previewPage,0);assert.equal(JSON.stringify(f.state.cache),before);
});
test('single/empty CRM results retain an accessible disabled pager without changing results',()=>{
  const f=fixture();const html=f.ctx.crmApiPreviewResults({crm:[]});assert(html.includes('0 mã'));assert.equal((html.match(/ disabled/g)||[]).length,2);assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
});
test('file feedback waits for parsing and then explicit import confirmation before saying imported',async()=>{
  let done;const f=fixture({selectFiles:async()=>new Promise(r=>done=r)}),task=f.ctx.selectFiles('crm',[{name:'data.csv'}]);
  assert.equal(f.getUploads()[0].state,'busy');const pending={id:'x',kind:'crm',token:'scope-A'};f.ctx.pendingImports.push(pending);done();await task;assert.equal(f.getUploads()[0].state,'pending');
  await f.ctx.confirmImport(pending);assert.equal(f.getUploads()[0].state,'done');
});
test('duplicate/no-op imports and unresolved confirmations cannot falsely report success',async()=>{
  const f=fixture({confirmImport:async()=>{}});await f.ctx.selectFiles('report',[{name:'duplicate.csv'}]);assert.equal(f.getUploads()[0].state,'idle');
  const p={id:'x',kind:'report',token:'scope-A'};f.ctx.pendingImports.push(p);await f.ctx.confirmImport(p);assert.equal(f.getUploads()[0].state,'idle');
});
test('import errors preserve the original failure; late results never decorate a different scope',async()=>{
  const error=new Error('original parsing failure'),f=fixture({selectFiles:async()=>{throw error}});await assert.rejects(f.ctx.selectFiles('links',[{name:'bad.csv'}]),e=>e===error);assert.equal(f.getUploads()[0].state,'error');
  let done;const g=fixture({selectFiles:async()=>new Promise(r=>done=r)}),task=g.ctx.selectFiles('crm',[{name:'old.csv'}]);g.setScope('scope-B');g.ctx.pilotUiUploadSync();done();await task;assert.equal(g.getUploads().length,0);
});
test('fields display only constraints already present; business validation is never replaced',()=>{
  const f=fixture(),classes=new Set(),field={matches:()=>true,validity:{valid:false},classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),toggle:(x,on)=>on?classes.add(x):classes.delete(x)}};
  f.ctx.pilotUiFieldTouch(field);assert(classes.has('pilot-ui-native-invalid'));field.validity.valid=true;f.ctx.pilotUiFieldTouch(field);assert(!classes.has('pilot-ui-native-invalid'));
  assert(!code.includes('setCustomValidity'));assert(!code.includes('.value='));
});
test('Escape suppression ends when keyboard focus leaves an icon, so a later focus can show its tooltip again',()=>{
  const f=fixture(),button={matches:()=>false};f.ctx.targetButton=button;vm.runInContext('pilotUiTooltipMuted=targetButton',f.ctx);
  f.events.focusout({target:button});assert.equal(vm.runInContext('pilotUiTooltipMuted',f.ctx),null);
});
test('calendar keyboard uses UTC date helpers over leap months/year and clamps future focus',()=>{
  const f=fixture(),days=[];f.ctx.pilotUiRangeFocus=day=>days.push(day);
  const press=(day,key)=>{let prevented=false;f.ctx.pilotUiCalendarKey({key,target:{closest:()=>({dataset:{args:encodeURIComponent(JSON.stringify({day}))}})},preventDefault(){prevented=true}});assert(prevented);return days.at(-1)};
  assert.equal(press('2024-01-31','PageDown'),'2024-02-29');assert.equal(press('2026-01-31','PageDown'),'2026-02-28');assert.equal(press('2026-01-01','ArrowLeft'),'2025-12-31');assert.equal(press('2026-11-25','Home'),'2026-11-23');assert.equal(press('2026-11-25','End'),'2026-11-26');assert.equal(press('2026-11-26','ArrowRight'),'2026-11-26');
  assert.equal(f.calls.length,0);
});
test('existing actions, options and operation results pass through unchanged',async()=>{
  const f=fixture(),args={period:'thursday'},el={id:'original'};assert.equal(await f.ctx.perform('crm-api-period',args,el),'original-result');assert.equal(f.calls[0][0],'crm-api-period');assert.equal(f.calls[0][1],args);assert.equal(f.calls[0][2],el);
});
test('presentation build is isolated and has no new network, polling, runtime dependency or validation engine',()=>{
  const prepare=readFileSync(new URL('../prepare.mjs',import.meta.url),'utf8'),css=readFileSync(new URL('../pilot-inputs.css',import.meta.url),'utf8');
  assert(prepare.includes("readFile(resolve(here,'pilot-inputs.js')"));assert(prepare.includes("copyFile(resolve(here,'pilot-inputs.css')"));assert(!code.includes('fetch('));assert(!code.includes('crmApiSend('));assert(!code.includes('setInterval('));assert(!css.includes(':root'));assert(css.includes('prefers-reduced-motion:reduce'));assert(css.includes('body.reduced-motion'));
});
