import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
const core=scripts.find(match=>/\bid="core"/.test(match[1]))[2];
const app=scripts.find(match=>match[2].includes('function reportData()'))[2];
function source(name){
  const start=app.search(new RegExp('^function '+name+'\\(','m'));
  assert(start>=0,name);const rest=app.slice(start),end=rest.slice(rest.indexOf('\n')+1).search(/^(?:(?:async )?function |const |let |window\.|document\.)/m);
  return end<0?rest:rest.slice(0,rest.indexOf('\n')+1+end);
}
const codes=['LUC883LUV457TA','LUC883LUV457TA8B','LUC883LUV457TA-L12','LUC883LUV457TA8B-L12'];
function fixture(uid='ThoLD',channel='CD'){
  let daily=[];
  const user={id:uid,master:{subjects:[]},config:{campaignNameConfig:{}},reportRules:undefined};
  const report={sources:[],crmPaste:'',links:'',mappings:{},linkMappings:{},rejectedLinks:[],ack:[]};
  const ctx=vm.createContext({structuredClone,user:()=>user,report:()=>report,workspace:()=>({}),db:{session:{channel}},compute:()=>daily,
    key:(...x)=>x.join('|'),canon:x=>String(x??'').toUpperCase(),subjectKey:x=>String(x??'').toUpperCase(),clone:structuredClone,
    fingerprint:JSON.stringify,pendingImports:[],reportCache:null});
  vm.runInContext(core+';var C=SieuCore.default;',ctx);
  for(const name of ['cdLinkCode','dailyPermalinkCodes','resolveDailyCdPermalink','cdMediaMatchesMix','resolveCdReportLinkRows','filterSelectedDailyGeneratedLinks','pullSelectedDailyCdLinks','rk','displayCode','crmData','reportData'])vm.runInContext(source(name),ctx);
  const C=ctx.C,mode=channel==='CD'?'cd':'mess';report.profile=C.defaultReportProfile(mode);
  report.sources=[C.aggregatePositiveMetaRows({name:'Fixture',mode,mapping:{code:0,spend:1,result:2},rows:codes.map((c,i)=>({cells:['25/11/2026_*'+uid+'*_'+c+'_THCS--VIDEO',100*(i+1),i+1],rowNumber:i+2}))})];
  report.crmPaste='Mã\tSố Contacts\tSố đơn\tDoanh thu\n'+codes.map((c,i)=>[c,i+1,1,1000*(i+1)].join('\t')).join('\n');
  const url=c=>'https://example.test/'+c;
  report.links=codes.map(c=>c+'\t'+url(c)).join('\n');
  return {ctx,C,report,url,setDaily(rows){daily=rows;ctx.reportCache=null;},data(){ctx.reportCache=null;return ctx.reportData();}};
}

test('three profiles keep all four non-8B/8B/L12 link identities and metrics separate',()=>{
  for(const uid of ['ThoLD','Mynnh','Huyenbtt']){
    const f=fixture(uid),d=f.data();assert.equal(d.pre.errors.length,0);assert.equal(d.gating.length,0);assert(d.ready);
    for(const [i,code]of codes.entries()){
      const row=d.rows.find(row=>row.code===code);assert(row,code);assert.equal(row.links,f.url(code));assert.equal(row.spend,100*(i+1));assert.equal(row.contacts,i+1);assert.equal(row.orders,1);assert.equal(row.revenue,1000*(i+1));assert.equal(row.note,'test mới');
    }
  }
});

test('missing L12 links stay blank after warning acknowledgement; shared links need explicit rows',()=>{
  const f=fixture();f.report.links=codes.slice(0,2).map(c=>c+'\t'+f.url(c)).join('\n');
  let d=f.data();
  for(const code of codes.slice(2)){const row=d.rows.find(row=>row.code===code);assert.equal(row.links,'');assert.equal(row.note,'');assert(d.warnings.some(w=>w.id==='missing-l12-'+row.key));}
  f.report.ack=d.warnings.map(w=>w.id);d=f.data();assert(d.ready);assert(d.rows.filter(row=>row.code.endsWith('-L12')).every(row=>!row.links));
  f.report.links+='\n'+codes[2]+'\t'+f.url(codes[0]);d=f.data();assert.equal(d.rows.find(row=>row.code===codes[2]).links,f.url(codes[0]));assert.equal(d.rows.find(row=>row.code===codes[3]).links,'');
});

test('conflicting distinct URLs are hard errors, while repeated equal URLs are deduplicated',()=>{
  for(const code of codes){
    const f=fixture();f.report.links+='\n'+code+'\t'+f.url(code);assert.equal(f.data().pre.errors.length,0);
    f.report.links+='\n'+code+'\thttps://example.test/conflict';let d=f.data();assert(d.pre.errors.some(e=>e.code==='LINK_CONFLICT'));assert.equal(d.rows.find(row=>row.code===code).links,'');
    f.report.ack=d.warnings.map(w=>w.id);d=f.data();assert(!d.ready);assert(d.pre.errors.some(e=>e.code==='LINK_CONFLICT'));
  }
});

test('Daily uses the actual L12 variant and exact MIX before a Media alias',()=>{
  const f=fixture(),row={rawContent:'LUV457TA (KHTN)',contentCode:'LUV457TA',mixCode:codes[0],source:{mediaCode:'LUV457TA'},subject:'KHTN',campaignSuffix:'-L12'};
  const mappings=codes.map(c=>({adName:'25/11/2026_*ThoLD*_'+c+'_THCS--VIDEO',permalink:f.url(c),sourceLine:1}));
  assert.equal(f.ctx.resolveDailyCdPermalink(row,mappings).permalink,f.url(codes[2]));
  assert.equal(f.ctx.resolveDailyCdPermalink({...row,subject:'TOAN',campaignSuffix:'-PXN',rawContent:'LUV457TA (Toán)'},mappings).permalink,f.url(codes[0]));
  assert.equal(f.ctx.resolveDailyCdPermalink({...row,rawContent:'LUV457TA (KHTN) 8b'},mappings).permalink,f.url(codes[3]));
  assert.equal(f.ctx.resolveDailyCdPermalink(row,mappings.filter(m=>!m.adName.includes('-L12'))).status,'NONE');
  const other={adName:'LUC884LUV457TA-L12',permalink:'https://example.test/other',sourceLine:2};
  assert.equal(f.ctx.resolveDailyCdPermalink(row,[other]).status,'NONE');
  assert.equal(f.ctx.resolveDailyCdPermalink(row,[...mappings,other]).permalink,f.url(codes[2]));
  assert.equal(f.ctx.cdMediaMatchesMix('LUV457TA-L12',codes[2]),true);
  assert.equal(f.ctx.cdMediaMatchesMix('LUV457TA',codes[2]),false);
  assert.equal(f.ctx.cdMediaMatchesMix('LUV457TA8B-L12',codes[2]),false);
});

test('Daily refresh keeps L12 links, selection and distinct 8B identities without duplicates',()=>{
  const f=fixture();f.report.links='';
  f.setDaily(codes.map(c=>({selected:true,rawContent:c.replace(/-L12$/,''),mixCode:c.replace(/-L12$/,''),campaignSuffix:c.endsWith('-L12')?'-L12':'-PXN',subject:c.endsWith('-L12')?'KHTN':'TOAN',postPermalink:f.url(c)})));
  f.ctx.pullSelectedDailyCdLinks(f.report);f.ctx.pullSelectedDailyCdLinks(f.report);
  assert.equal(f.C.parseSuperReportLinkPaste(f.report.links).rows.length,4);
  let d=f.data();for(const code of codes)assert.equal(d.rows.find(row=>row.code===code).links,f.url(code));
  f.setDaily([]);f.ctx.pullSelectedDailyCdLinks(f.report);d=f.data();assert(d.rows.every(row=>row.links===''));assert.equal(f.report.links,'');
});

test('MESS report identities and links retain their existing behavior',()=>{
  for(const uid of ['ThoLD','Mynnh','Huyenbtt']){const f=fixture(uid,'MESS'),d=f.data();assert(d.ready);for(const code of codes)assert.equal(d.rows.find(row=>row.code===code).links,f.url(code));}
});
