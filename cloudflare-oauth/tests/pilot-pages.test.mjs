import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../pilot-pages.js',import.meta.url),'utf8');
function fixture(){
  const events={},calls=[],page={pageId:'001234567890123456789',name:'Cùng con học tốt lớp 6'},extra={pageId:'hidden',name:'Another Page'};let scope='A';
  const button={isConnected:true,dataset:{row:'encoded-row'},setAttribute(){},removeAttribute(){},focus(){calls.push('focus')}},select={isConnected:true,dataset:{row:'encoded-row'},value:page.pageId,options:[{value:'',textContent:'Chọn Page'},{value:page.pageId,textContent:page.name}],dispatchEvent:e=>calls.push({event:e.type,bubbles:e.bubbles,value:select.value})};
  const reg={pages:[page,extra],pageTypes:[]};
  const ctx=vm.createContext({Event,ui:{view:'daily'},capture:()=>scope,registry:()=>reg,C:{registryPageTypeIds:page=>page.pageTypeIds||[page.pageTypeId].filter(Boolean)},compute:()=>[],profileSourcePageTypes:()=>[],render:()=>calls.push('render'),refreshDailyTableOnly:()=>calls.push('refresh'),document:{querySelectorAll:()=>[button],addEventListener:(type,fn)=>events[type]=fn},window:{addEventListener(){}},esc:String});
  vm.runInContext(source,ctx);
  const state={button,select,scope:'A',panel:{remove(){calls.push('removed')}},shown:[{value:''},{value:page.pageId}]};
  ctx.testState=state;vm.runInContext('pilotPagePopup=testState',ctx);
  return {ctx,events,calls,page,select,state,button,reg,setScope(value){scope=value;},popup:()=>vm.runInContext('pilotPagePopup',ctx)};
}
test('Page options come only from the live original select; registry extras never become candidates',()=>{
  const f=fixture();const options=Array.from(f.ctx.pilotPageAllowedOptions(f.select));assert.equal(options.length,2);assert(!options.some(o=>o.value==='hidden'));assert.equal(options[1].value,'001234567890123456789');assert.equal(f.select.value,f.page.pageId);
  f.select.options[1].hidden=true;assert.equal(f.ctx.pilotPageAllowedOptions(f.select).length,1);f.select.options[1].hidden=false;f.select.options[1].disabled=true;assert.equal(f.ctx.pilotPageAllowedOptions(f.select).length,1);
});
test('search supports accents, Vietnamese Đ and full string IDs without changing options or selection',()=>{
  const f=fixture(),options=f.ctx.pilotPageAllowedOptions(f.select),before=JSON.stringify(f.select);
  assert.equal(f.ctx.pilotPageFilter(options,'cung con')[0].value,f.page.pageId);assert.equal(f.ctx.pilotPageFilter(options,'001234567890123456789')[0].value,f.page.pageId);assert.equal(f.ctx.pilotPageSearchKey('ĐỨC THỌ'),'duc tho');assert.equal(f.ctx.pilotPageFilter(options,'nothing').length,0);assert.equal(JSON.stringify(f.select),before);
});
test('choosing a different allowed Page dispatches exactly the original bubbling change event',()=>{
  const f=fixture();f.ctx.pilotPageChoose(0);assert.equal(f.select.value,'');assert.deepEqual(f.calls.filter(c=>typeof c==='object'),[{event:'change',bubbles:true,value:''}]);assert.equal(f.popup(),null);
});
test('choosing the current Page is a no-op; Escape/close does not write selection',()=>{
  const f=fixture();f.ctx.pilotPageChoose(1);assert.equal(f.select.value,f.page.pageId);assert(!f.calls.some(c=>typeof c==='object'));
  const g=fixture();g.ctx.pilotPageClose(true);assert.equal(g.select.value,g.page.pageId);assert(g.calls.includes('focus'));assert(!g.calls.some(c=>typeof c==='object'));
});
test('stale scope, removed controls and changed native eligibility reject a pending choice',()=>{
  for(const change of [f=>f.setScope('B'),f=>f.select.isConnected=false,f=>f.select.options[0].disabled=true,f=>f.select.options[0].hidden=true]){
    const f=fixture();change(f);f.ctx.pilotPageChoose(0);assert.equal(f.select.value,f.page.pageId);assert(!f.calls.some(c=>typeof c==='object'));assert.equal(f.popup(),null);
  }
});
test('render and Daily partial refresh close old popups and pass through the original operation',()=>{
  const f=fixture();f.ctx.ui.view='report';f.ctx.render();assert.equal(f.popup(),null);assert(f.calls.includes('render'));
  const g=fixture();g.ctx.ui.view='report';g.ctx.refreshDailyTableOnly();assert.equal(g.popup(),null);assert(g.calls.includes('refresh'));
});
test('Page adapter does not call APIs, modify registry/config or replace native Page-type rules',()=>{
  assert(!source.includes('fetch('));assert(!source.includes('setInterval('));assert(!source.includes('workspace()'));assert(!source.includes('pageTypeId='));assert(source.includes("dispatchEvent(new Event('change',{bubbles:true}))"));
  const prepare=readFileSync(new URL('../prepare.mjs',import.meta.url),'utf8'),css=readFileSync(new URL('../pilot-pages.css',import.meta.url),'utf8');assert(prepare.includes("readFile(resolve(here,'pilot-pages.js')"));assert(css.includes('prefers-reduced-motion:reduce'));assert(!css.includes(':root'));
});
test('long Page types shorten only their displayed labels, preserving distinguishing names and original IDs/options',()=>{
  const f=fixture(),before=JSON.stringify(f.select.options);
  for(const [full,short]of [
    ['Page Vuihoc/Page thầy Thọ','Vuihoc · thầy Thọ'],
    ['Page Vuihoc (Cap no media)','Vuihoc · Không media'],
    ['Page Vuihoc\n(Cap no media)','Vuihoc · Không media'],
    ['Page Vuihoc\nPage cô Lan Anh','Vuihoc · cô Lan Anh'],
    ['Page Vuihoc Page cô Lan Anh','Vuihoc · cô Lan Anh'],
    ['QC','QC'],['PH','PH'],['Nhóm tùy chỉnh 2027','Nhóm tùy chỉnh 2027']
  ])assert.equal(f.ctx.pilotPageTypeLabel(full),short);
  assert.equal(JSON.stringify(f.select.options),before);
});
test('a display alias collision keeps the full name rather than making two types look equivalent',()=>{
  const f=fixture(),labels=['Page Vuihoc','Vuihoc'];
  assert.equal(f.ctx.pilotPageTypeLabel(labels[0],labels),'Page Vuihoc');
  assert.notEqual(f.ctx.pilotPageTypeLabel(labels[0],labels),f.ctx.pilotPageTypeLabel(labels[1],labels));
});
test('compact fields remove letter avatars and repeated Page labels while keeping full native type options and popup names',()=>{
  const css=readFileSync(new URL('../pilot-pages.css',import.meta.url),'utf8');
  assert(!source.includes('pilot-page-avatar'));assert(!source.includes('<small>Page</small>'));
  assert(css.includes('height:36px'));assert(css.includes('max-width:45%'));assert(css.includes('text-overflow:ellipsis'));
  assert(source.includes('button.title=name'));assert(source.includes('typeBox.title=full'));assert(source.includes('type.title=full'));
  assert(!/option\.(?:textContent|value)\s*=(?!=)/.test(source));
});
function thcsFixture(){
  const f=fixture(),html=readFileSync(new URL('../../index.html',import.meta.url),'utf8'),seed=JSON.parse(html.match(/<script id="seed"[^>]*>([\s\S]*?)<\/script>/)[1]);
  Object.assign(f.reg,structuredClone(seed.users.find(u=>u.id==='ThoLD').registries.thcs));
  f.select.options=[{value:'',textContent:'Chọn Page'},...f.reg.pages.map(p=>({value:p.pageId,textContent:p.name}))];f.select.value='101937415648529';
  const type={dataset:{field:'pageTypeId'},value:f.reg.pageTypes.find(t=>t.name==='QC').typeId};
  f.select.closest=()=>({querySelectorAll:()=>[f.select,type]});return {...f,type};
}
test('actual ThoLD THCS: QC excludes Minh Trang PH; PH excludes the QC/GV Page',()=>{
  const f=thcsFixture(),snapshot=JSON.stringify(f.reg);
  assert.deepEqual(Array.from(f.ctx.pilotPageAllowedOptions(f.select),o=>o.value),['','101937415648529']);
  f.type.value=f.reg.pageTypes.find(t=>t.name==='PH').typeId;
  assert.deepEqual(Array.from(f.ctx.pilotPageAllowedOptions(f.select),o=>o.value),['','112903215206399']);
  assert.equal(JSON.stringify(f.reg),snapshot,'filter never rewrites registry memberships');
});
test('multi-type Pages match by exact membership ID; inactive types/Pages are excluded',()=>{
  const f=thcsFixture();
  for(const name of ['QC','GV','QC-GV']){f.type.value=f.reg.pageTypes.find(t=>t.name===name).typeId;assert.equal(f.ctx.pilotPageAllowedOptions(f.select)[1].value,'101937415648529');}
  f.reg.pageTypes.find(t=>t.typeId===f.type.value).isActive=false;assert.equal(f.ctx.pilotPageAllowedOptions(f.select).length,1);
  f.type.value=f.reg.pageTypes.find(t=>t.name==='QC').typeId;f.reg.pages[0].isActive=false;assert.equal(f.ctx.pilotPageAllowedOptions(f.select).length,1);
});
test('explicitly clearing the type permits the original native options, without adding registry extras',()=>{
  const f=thcsFixture();f.type.value='';assert.equal(f.ctx.pilotPageAllowedOptions(f.select).length,3);
  f.reg.pages.push({pageId:'not-in-original-select',name:'Extra QC',isActive:true,pageTypeIds:[f.reg.pageTypes[0].typeId]});assert.equal(f.ctx.pilotPageAllowedOptions(f.select).length,3);
});
test('single-type chip and unresolved source group still filter without a native type dropdown',()=>{
  const f=thcsFixture();f.select.closest=()=>null;f.select.value='112903215206399';
  assert.deepEqual(Array.from(f.ctx.pilotPageAllowedOptions(f.select),o=>o.value),['','112903215206399']);
  f.select.value='';f.select.dataset.row=encodeURIComponent(JSON.stringify('source-row'));f.ctx.compute=()=>[{id:'source-row',source:{companyPage:{pageType:'QC'}}}];f.ctx.profileSourcePageTypes=()=>[f.reg.pageTypes.find(t=>t.name==='QC')];
  assert.deepEqual(Array.from(f.ctx.pilotPageAllowedOptions(f.select),o=>o.value),['','101937415648529']);
});
test('changing the type or memberships after opening cannot commit a stale cross-type option',()=>{
  for(const change of [f=>f.type.value=f.reg.pageTypes.find(t=>t.name==='PH').typeId,f=>f.reg.pages[0].pageTypeIds=[f.reg.pageTypes.find(t=>t.name==='PH').typeId]]){
    const f=thcsFixture();f.state.shown=Array.from(f.ctx.pilotPageAllowedOptions(f.select));f.select.value='';change(f);f.ctx.pilotPageChoose(1);assert.equal(f.select.value,'');assert(!f.calls.some(c=>typeof c==='object'));assert.equal(f.popup(),null);
  }
});
