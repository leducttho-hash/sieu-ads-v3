import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
const core=scripts.find(match=>/\bid="core"/.test(match[1]))[2];
const app=scripts.find(match=>match[2].includes('function normalizedFive()'))[2];
function functionSource(name){
  const match=new RegExp('^(?:async )?function '+name+'\\(','m').exec(app);
  assert(match,'Application function missing: '+name);
  const rest=app.slice(match.index),lineEnd=rest.indexOf('\n');
  const next=rest.slice(lineEnd+1).search(/^(?:(?:async )?function |const |let |window\.|document\.)/m);
  return next<0?rest:rest.slice(0,lineEnd+1+next);
}
function fixture(){
  let reg={pageTypes:[{code:'QC',name:'QC',aliases:[]}],pages:[]};
  const layout=['contentCode','caption','mediaCode','mixCode','pageRaw'];
  const work={fiveRows:[],dailyPaste:'',overrides:{}};
  const catalog={layout,rows:[]};
  const who={id:'ThoLD',localVersion:1,config:{}};
  const downloads=[],imports=[];
  const ctx=vm.createContext({structuredClone,Blob,TextEncoder,TextDecoder,
    user:()=>who,wh:()=>({id:'thcs',layout}),registry:()=>reg,
    workspace:()=>work,sharedCatalog:()=>catalog,scopeKey:()=> 'ThoLD|thcs|CD',
    canon:value=>String(value??'').normalize('NFKC').trim().toUpperCase(),
    conveyorItems:()=>[],ui:{},db:{session:{channel:'CD'},sourceScopeRepairs:{},marker:'preserve'},
    key:(...parts)=>parts.join('|'),
    capture:()=> 'scope',importCancel:0,pendingImports:[],guard:()=>{},
    importJSON:async(kind,data)=>imports.push({kind,data}),render:()=>{},notice:()=>{},
    persistNow:async()=>{},download:(name,value)=>downloads.push({name,value}),
    dateParts:()=>({iso:'2026-11-18'}),report:()=>({}),SEED:{sourceCommit:'fixture'},
  });
  vm.runInContext(core+';var C=SieuCore.default;',ctx);
  vm.runInContext('const _catRowCache=new WeakMap(),_regTokenCache=new WeakMap(),_registryCacheIds=new WeakMap();let _normMemo=null,_registryCacheSerial=0;',ctx);
  for(const name of ['cleanCodeToken','getRegTokens','mapRawFiveRow','registryCacheId','uniqueCatalogHit','fiveRowMixIdentity','getCachedCatData','normalizedFive','isSkeletonFiveRow','dailyCodeLookupKey','syncFiveSkeletonsFromDaily','fillDailyRowsFromCatalog','smartMatchAndFillFiveRows','selectFiles','namedBackup','performCore'])vm.runInContext(functionSource(name),ctx);
  return {ctx,layout,work,catalog,downloads,imports,setRegistry(value){reg=value;}};
}
const rows=()=>[
  ['LUC883','First caption','LUV457TA','LUC883LUV457TA','QC'],
  ['LUC884','Second caption','LUV457TA','LUC884LUV457TA','QC'],
];

test('ambiguous Media stays ambiguous after automatic fill and local MIX overrides',()=>{
  const {ctx,work,catalog,layout}=fixture();catalog.rows=rows();
  work.dailyPaste='18/11\tLUV457TA (Toán)';
  assert.equal(ctx.uniqueCatalogHit(ctx.getCachedCatData(catalog,layout),'LUV457TA'),null);
  ctx.syncFiveSkeletonsFromDaily();
  assert.equal(new Set(Array.from(ctx.normalizedFive()).filter(row=>row.mediaCode==='LUV457TA').map(row=>row.mixCode)).size,2);
  assert.equal(ctx.fillDailyRowsFromCatalog(catalog.rows,layout),0);
  work.fiveRows=[rows()[0]];
  assert.equal(new Set(Array.from(ctx.normalizedFive()).filter(row=>row.mediaCode==='LUV457TA').map(row=>row.mixCode)).size,2);
  assert.equal(ctx.uniqueCatalogHit(ctx.getCachedCatData(catalog,layout),'LUC884LUV457TA').caption,'Second caption');
  work.dailyPaste='18/11\tLUC883LUV457TA (Toán)\n18/11\tLUC884LUV457TA (Toán)';
  work.fiveRows=[];ctx.fillDailyRowsFromCatalog(catalog.rows,layout);
  assert.deepEqual(Array.from(work.fiveRows,row=>row[3]),['LUC883LUV457TA','LUC884LUV457TA']);
});

test('pasting distinct MIX rows sharing Media preserves both; repeating a MIX updates it',()=>{
  const {ctx,work}=fixture();ctx.smartMatchAndFillFiveRows(rows(),0,0);
  assert.equal(work.fiveRows.length,2);
  const updated=rows()[0];updated[1]='Updated first';ctx.smartMatchAndFillFiveRows([updated],0,0);
  assert.equal(work.fiveRows.length,2);assert.equal(work.fiveRows[0][1],'Updated first');assert.equal(work.fiveRows[1][1],'Second caption');
  work.fiveRows=[['','','LUV457TA','','']];ctx.smartMatchAndFillFiveRows(rows(),0,0);
  assert.equal(work.fiveRows.length,2);
});

test('saved Registry replacement invalidates local and Catalog source classification',()=>{
  const {ctx,work,catalog,setRegistry}=fixture();
  work.fiveRows=[['QA1','Body','','QA1','NEW_TYPE']];
  catalog.rows=[['QA2','Body','','QA2','NEW_TYPE']];
  assert(ctx.normalizedFive().every(row=>row.companyPage.pageType===''));
  setRegistry({pageTypes:[{code:'NEW_TYPE',name:'NEW_TYPE',aliases:[]}],pages:[]});
  assert(ctx.normalizedFive().every(row=>row.companyPage.pageType==='NEW_TYPE'));
});

test('backup uses the 50 MiB limit while data files retain 25 MiB',async()=>{
  const {ctx,downloads,imports}=fixture();
  const backup={name:'backup.json',size:33524027,text:async()=>JSON.stringify({type:'SIEUADS_OFFLINE_BACKUP'})};
  await ctx.selectFiles('backup',[backup]);assert.equal(imports.length,1);
  await assert.rejects(ctx.selectFiles('backup',[{...backup,size:50*1024*1024+1}]),/50 MB/);
  await assert.rejects(ctx.selectFiles('source',[backup]),/25 MB/);
  await ctx.performCore('backup-all');assert.equal(downloads.length,1);assert.equal(JSON.parse(downloads[0].value).data.marker,'preserve');
  ctx.db.large='x'.repeat(50*1024*1024);
  await assert.rejects(ctx.performCore('backup-all'),/50 MB/);
  assert.equal(downloads.length,1,'must not emit an unrestorable oversized backup');
});
