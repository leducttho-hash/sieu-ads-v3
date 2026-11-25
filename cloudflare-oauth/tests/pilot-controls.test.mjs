import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const source=readFileSync(new URL('../pilot-controls.js',import.meta.url),'utf8');
class Element{
 constructor(tag='button',text=''){
  this.tagName=tag.toUpperCase();this.dataset={};this.children=[];this.attributes=new Map();this._text=text;this.disabled=false;this.isConnected=true;this.offsetHeight=33;this.offsetWidth=100;this.offsetLeft=0;this.offsetTop=0;
  this.classes=new Set();this.classList={add:(...v)=>v.forEach(x=>this.classes.add(x)),remove:(...v)=>v.forEach(x=>this.classes.delete(x)),contains:v=>this.classes.has(v)};
  this.styles=new Map();this.style={setProperty:(k,v)=>this.styles.set(k,v)};
 }
 set className(value){this.classes=new Set(value.split(/\s+/).filter(Boolean));}
 get className(){return [...this.classes].join(' ');}
 get firstChild(){return this.children[0]||null;}
 get textContent(){return this._text+this.children.map(el=>el.textContent).join('');}
 set textContent(value){this._text=value;this.children=[];}
 set innerHTML(value){this._html=value;this.children=[];}
 append(child){if(child.parentElement){const siblings=child.parentElement.children;siblings.splice(siblings.indexOf(child),1);}child.parentElement=this;this.children.push(child);}
 insertBefore(child,before){child.parentElement=this;this.children.splice(this.children.indexOf(before),0,child);}
 setAttribute(k,v){this.attributes.set(k,String(v));if(k==='id')this.id=v;}
 getAttribute(k){return this.attributes.get(k)??null;}
 hasAttribute(k){return this.attributes.has(k);}
 removeAttribute(k){this.attributes.delete(k);}
 matches(selector){return selector==='[data-action]'||selector==='button[data-action]'?this.tagName==='BUTTON'&&!!this.dataset.action:false;}
 querySelector(selector){const cls=selector.slice(1);return this.children.find(el=>el.classList.contains(cls))||null;}
 closest(selector){if(selector==='.pilot-segments > button[data-action]')return this.parentElement?.classList.contains('pilot-segments')?this:null;if(selector==='details.export-dropdown')return this.dropdown||null;return null;}
 focus(){this.focused=true;}
 click(){this.onClick?.();}
}
function fixture(){
 const buttons=[],groups=[],summaries=[],events={},windowEvents={},announcements=[],calls=[];
 let scope='A|W1|CD|1',handler=async()=>{};
 const body=new Element('body'),document={body,fonts:null,createElement:tag=>new Element(tag),
  querySelectorAll:selector=>selector==='[data-action]'?buttons:selector==='.pilot-segments'?groups:selector==='details.export-dropdown > summary'?summaries:[],
  querySelector:()=>null,getElementById:id=>body.children.find(el=>el.id===id)||null,
  addEventListener:(type,fn)=>events[type]=fn};
 const ctx=vm.createContext({document,window:{addEventListener:(type,fn)=>windowEvents[type]=fn},navigator:{clipboard:{write:async()=>{}}},
  ui:{view:'report'},capture:()=>scope,render:()=>{},copyText:async text=>{if(!text)throw Error('Không có dữ liệu để copy');},
  perform:async(...args)=>{calls.push(args);return handler(...args);},setTimeout,clearTimeout,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,Map,Set,JSON,Array,String});
 vm.runInContext(source,ctx);
 function button(action='export-report',args='',label='Xuất XLSX'){
  const el=new Element();const text=new Element('span',label);el.append(text);el.dataset.action=action;el.dataset.args=args;buttons.push(el);return el;
 }
 const state=el=>el.dataset.pilotFeedbackState;
 const status=()=>document.getElementById('pilot-controls-status')?.textContent||'';
 return {ctx,buttons,groups,summaries,document,events,calls,button,state,status,announcements,
  scope:value=>scope=value,handler:fn=>handler=fn,dispose:()=>windowEvents.pagehide()};
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

test('export stays busy until the actual operation resolves; repeated exports are blocked',async()=>{
 const f=fixture(),work=deferred(),button=f.button(),other=f.button('export-report-tsv');
 try{
  f.handler(()=>work.promise);const running=f.ctx.perform('export-report',{header:false},button);
  assert.equal(f.state(button),'busy');assert(button.disabled);assert(other.disabled);
  await f.ctx.perform('export-report-tsv',{},other);
  await new Promise(resolve=>setTimeout(resolve,15));assert.equal(f.calls.length,1);assert.equal(f.state(button),'busy');assert(!f.status().includes('Đã tạo'));
  work.resolve('workbook');assert.equal(await running,'workbook');assert.equal(f.state(button),'ok');assert(!button.disabled);assert(!other.disabled);assert.equal(f.status(),'Đã tạo file.');
 }finally{f.dispose();}
});
test('validation or serialization failure propagates to the existing error handler and permits retry',async()=>{
 const f=fixture(),button=f.button();
 try{f.handler(()=>{throw Error('Báo cáo còn lỗi');});await assert.rejects(f.ctx.perform('export-report',{},button),/Báo cáo còn lỗi/);assert.equal(f.state(button),'error');assert(!button.disabled);assert.equal(button.getAttribute('aria-busy'),null);assert(!f.status().includes('Đã tạo'));
  f.handler(async()=>42);assert.equal(await f.ctx.perform('export-report',{},button),42);assert.equal(f.state(button),'ok');
 }finally{f.dispose();}
});
test('a report option in a closed menu also shows progress and completion on the visible summary',async()=>{
 const f=fixture(),button=f.button(),summary=new Element('summary','Xuất / Copy báo cáo'),work=deferred();button.dropdown={};summary.classList.add('primary');f.summaries.push(summary);
 try{f.handler(()=>work.promise);const running=f.ctx.perform('export-report',{},button);assert.equal(f.state(summary),'busy');assert(summary.classList.contains('pilot-feedback-download'));work.resolve();await running;assert.equal(f.state(summary),'ok');assert.equal(summary.dataset.action,undefined);}finally{f.dispose();}
});
test('copy feedback waits for clipboard confirmation and reports rejection, including rich clipboard',async()=>{
 const f=fixture(),button=f.button('copy-report'),copy=deferred();
 try{
  f.ctx.navigator.clipboard.write=()=>copy.promise;f.handler(()=>f.ctx.pilotFeedbackClipboardWrite(['original payload']));
  const running=f.ctx.perform('copy-report',{},button);assert.equal(f.state(button),'busy');copy.reject(Error('Clipboard denied'));await assert.rejects(running,/Clipboard denied/);assert.equal(f.state(button),'error');assert(!f.status().includes('Đã copy'));
  f.handler(()=>f.ctx.copyText('same TSV'));await f.ctx.perform('copy-report',{},button);assert.equal(f.state(button),'ok');assert.equal(f.status(),'Đã copy.');
 }finally{f.dispose();}
});
test('copy operation that warns and returns without copying never shows a success check',async()=>{
 const f=fixture(),button=f.button('copy-posts');try{await f.ctx.perform('copy-posts',{},button);assert.equal(f.state(button),'idle');assert(!f.status().includes('Đã copy'));}finally{f.dispose();}
});
test('rerender preserves busy feedback, business-disabled buttons and original accessible labels',async()=>{
 const f=fixture(),button=f.button(),work=deferred();
 try{
  button.setAttribute('aria-label','Xuất bản không tiêu đề');f.handler(()=>work.promise);const running=f.ctx.perform('export-report',{},button);
  f.buttons.splice(0);button.isConnected=false;
  const fresh=f.button(),disabled=f.button('export-build');disabled.disabled=true;fresh.setAttribute('aria-label','Xuất bản không tiêu đề');
  f.ctx.render();assert.equal(f.state(fresh),'busy');assert(fresh.disabled);assert(disabled.disabled);
  work.resolve();await running;assert.equal(f.state(fresh),'ok');assert(!fresh.disabled);assert(disabled.disabled);
  vm.runInContext('pilotFeedbackStates.clear()',f.ctx);f.ctx.render();assert.equal(fresh.getAttribute('aria-label'),'Xuất bản không tiêu đề');assert.equal(f.state(fresh),'idle');
 }finally{work.resolve();f.dispose();}
});
test('changing user/warehouse/channel before export starts prevents the old operation',async()=>{
 const f=fixture(),button=f.button();try{const running=f.ctx.perform('export-report',{},button);f.scope('B|W2|MESS|1');f.ctx.render();await running;assert.equal(f.calls.length,0);assert(!button.disabled);assert.equal(f.state(button),'idle');}finally{f.dispose();}
});
test('a late result cannot paint success in another scope, and locks do not follow that scope',async()=>{
 const f=fixture(),button=f.button('copy'),work=deferred();
 try{f.handler(()=>work.promise);const running=f.ctx.perform('copy',{text:'original'},button);assert.equal(f.calls.length,1);f.scope('B|W2|MESS|1');f.ctx.render();assert(!button.disabled);assert.equal(f.status(),'');work.resolve();await running;assert.equal(f.state(button),'idle');assert(!f.status().includes('Đã copy'));}finally{f.dispose();}
});
test('adapter passes the original action, options, element and result through unchanged',async()=>{
 const f=fixture(),button=f.button('export-build'),options={kind:'scale',header:false},payload={rows:[{code:'ABC8B-L12',Title:'Giữ nguyên'}]};
 try{f.handler(async(action,args,el)=>{assert.equal(action,'export-build');assert.equal(args,options);assert.equal(el,button);return payload;});assert.equal(await f.ctx.perform('export-build',options,button),payload);assert.equal(f.calls.length,1);
  f.handler(async()=>{});const ignored=f.button('backup-all');await f.ctx.perform('unrelated',options,ignored);assert.equal(f.state(ignored),undefined);
 }finally{f.dispose();}
});
test('source and channel indicators use existing selections and keyboard triggers existing buttons only',()=>{
 const f=fixture(),group=new Element('div');group.dataset.pilotSegments='channel';group.classList.add('pilot-segments');
 const a=f.button('switch-channel','CD','CĐ'),b=f.button('switch-channel','MESS','MESS');a.dataset.channelSeg='CD';b.dataset.channelSeg='MESS';a.classList.add('active');b.offsetLeft=80;b.offsetWidth=90;
 group.append(a);group.append(b);const thumb=new Element('span');thumb.classList.add('pilot-segment-thumb');group.append(thumb);f.groups.push(group);
 try{f.ctx.pilotSegmentPlace(group);assert.equal(a.getAttribute('aria-pressed'),'true');assert.equal(b.getAttribute('aria-pressed'),'false');
  let switched=0;b.onClick=()=>{switched++;a.classList.remove('active');b.classList.add('active');f.ctx.pilotSegmentPlace(group);};let prevented=0;
  f.events.keydown({target:a,key:'ArrowRight',preventDefault(){prevented++;}});assert.equal(switched,1);assert.equal(prevented,1);assert.equal(b.getAttribute('aria-pressed'),'true');assert.equal(thumb.styles.get('--pilot-segment-left'),'80px');assert.equal(f.calls.length,0);
  f.events.keydown({target:a,key:'ArrowRight',ctrlKey:true,preventDefault(){throw Error('must not intercept shortcuts');}});assert.equal(switched,1);
 }finally{f.dispose();}
});
test('build adds only guarded Pilot hooks; the root stays at the reviewed suffix-fix baseline',()=>{
 const root=readFileSync(new URL('../../index.html',import.meta.url));const sha=createHash('sha1').update('blob '+root.byteLength+'\0').update(root).digest('hex');assert.equal(sha,'22fec473fb5c5900a0e2b4bed9bd14035807d1ab');
 const prepare=readFileSync(new URL('../prepare.mjs',import.meta.url),'utf8');assert(prepare.includes('pilot-controls.css'));assert(prepare.includes('pilotFeedbackClipboardWrite'));assert(prepare.includes('crmReplace('));
 const css=readFileSync(new URL('../pilot-controls.css',import.meta.url),'utf8');assert(css.includes('body.reduced-motion'));assert(css.includes('prefers-reduced-motion:reduce'));assert(!css.includes(':root'));assert(!source.includes('fetch('));assert(!source.includes('setInterval('));
});
