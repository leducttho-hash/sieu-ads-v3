import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
const core=scripts.find(x=>/\bid="core"/.test(x[1]))[2],app=scripts.find(x=>x[2].includes('function normalizedFive()'))[2];
function source(name){
  const match=new RegExp('^(?:async )?function '+name+'\\(','m').exec(app);assert(match,name);
  const rest=app.slice(match.index),lineEnd=rest.indexOf('\n'),next=rest.slice(lineEnd+1).search(/^(?:(?:async )?function |const |let |window\.|document\.)/m);
  return next<0?rest:rest.slice(0,lineEnd+1+next);
}
function fixture(){
  const rule={id:'season',marker:'TET',suffix:'TET',active:true,links:{TOAN:'https://season.example/math?offer=tet&x=1#form',KHTN:'https://season.example/science?utm_medium=old'}};
  const cfg={nameCode:'ThoLD',campaignNameConfig:{cdTemplate:'{DATE}_*{OWNER}*_{MIX_CODE}{SUFFIX}_',contentSuffixRules:[],seasonalRulesByWarehouse:{thcs:[rule]}}};
  const ctx=vm.createContext({URL,structuredClone,user:()=>({config:cfg}),wh:()=>({id:'thcs'}),subjectKey:v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()});
  vm.runInContext(core+';var C=SieuCore.default;',ctx);
  for(const name of ['seasonalRules','seasonalKey','seasonalRuleErrors','seasonalResolve','seasonalTag','seasonalLookupRaw','seasonalIdentity','seasonalApply','seasonalBuildInput','seasonalBuildErrors','cdLinkCode','dailyPermalinkCodes'])vm.runInContext(source(name),ctx);
  const item=(subject='TOAN',mixCode='TUV123')=>({subject,mixCode,contentCode:'TUV123',errors:[]});
  const apply=(raw,subject='TOAN',mixCode='TUV123')=>{const row=item(subject,mixCode);ctx.seasonalApply(row,raw,cfg,{name:subject,campaignPrefix:subject==='KHTN'?'MKT':''});return row;};
  return {ctx,cfg,rule,item,apply};
}

test('only enabled standalone external markers apply; code substrings and parenthetical rules stay ordinary',()=>{
  const f=fixture();
  for(const raw of ['TUV123 (Toán KHTN)','TUV123TET (Toán)','TUV123 (TET)','TUV123 (Toán) TET2027','TUV123 (Toán) NOTET','TET123 (Toán)'])assert(!f.ctx.seasonalResolve(raw,[f.rule]).matched,raw);
  for(const raw of ['TUV123 (Toán KHTN) TET','TUV123 (KHTN) tet.','TUV123 (Toán) ＴＥＴ','TUV123 (Toán) TET TET'])assert(f.ctx.seasonalResolve(raw,[f.rule]).matched,raw);
  f.rule.active=false;assert(!f.apply('TUV123 (KHTN) TET').seasonal);
  f.rule.active=true;assert.equal(f.ctx.seasonalRules(f.cfg,'other').length,0);
});

test('campaign identity and private URL agree for PXN/L12 and 8B; query parameters and hash survive',()=>{
  for(const subject of ['TOAN','KHTN'])for(const eight of [false,true]){
    const f=fixture(),raw='TUV123 ('+(subject==='TOAN'?'Toán KHTN':'KHTN')+') TET'+(eight?' 8B':''),row=f.apply(raw,subject);
    const stem='TUV123TET'+(eight?'8B':''),tail=subject==='KHTN'?'-L12':'-PXN';
    assert.deepEqual(Array.from(row.seasonal.errors),[]);assert.equal(row.seasonal.outputMixCode,stem);
    const url=new URL(row.seasonal.url);assert.equal(url.searchParams.get('utm_medium'),stem+tail);assert.equal(url.searchParams.getAll('utm_medium').length,1);assert.equal(url.searchParams.get('utm_source'),'FBADS');assert.equal(url.searchParams.get('utm_campaign'),(subject==='KHTN'?'MKT':'')+'ThoLD');
    if(subject==='TOAN'){assert.equal(url.searchParams.get('offer'),'tet');assert.equal(url.searchParams.get('x'),'1');assert.equal(url.hash,'#form');}
    const input=f.ctx.seasonalBuildInput(row,f.cfg);assert.equal(input.daily.mixCode,stem);assert.equal(input.name.contentSuffixRules.length,0);
    assert.equal(f.ctx.seasonalTag(stem+tail,'TET'),stem+tail,'idempotent suffix');
    assert.equal(f.ctx.seasonalTag(stem,'TET'),stem);assert.equal(f.ctx.seasonalIdentity('',raw,f.cfg,f.rule),'');
  }
});

test('legacy L2020/L2023 suffixes compose before TET and 8B without mutating their rules',()=>{
  for(const [marker,suffix]of [['l1','L2020'],['l2','L2023']]){
    const f=fixture();f.cfg.campaignNameConfig.contentSuffixRules=[{id:marker,marker,suffix,active:true}];
    const before=JSON.stringify(f.cfg),row=f.apply(`TUV123 (${marker}) TET 8B`,'TOAN');
    assert.equal(row.seasonal.outputMixCode,'TUV123'+suffix+'TET8B');assert.equal(JSON.stringify(f.cfg),before);
  }
});

test('lookup removes the external marker before legacy annotations, retaining the original source code and 8B evidence',()=>{
  const f=fixture();f.cfg.campaignNameConfig.contentSuffixRules=[{id:'l1',marker:'l1',suffix:'L2020',active:true}];
  for(const raw of ['TUV123 (l1) TET','TUV123 TET (l1)','TUV123 (l1) TET 8B','TUV123 (Toán KHTN) TET','TUV123 (l1) T\u200BET']){
    const lookup=f.ctx.seasonalLookupRaw(raw,f.cfg),stripped=f.ctx.C.stripMappedContentAnnotations(lookup,f.cfg.campaignNameConfig.contentSuffixRules);
    assert.equal(f.ctx.C.adsContentLookupIdentity(f.ctx.C.extractDailyContentCode(stripped)),'TUV123');
    assert.equal(lookup.includes('8B'),raw.includes('8B'));
  }
  const raw='TUV123TET (Toán)';assert.equal(f.ctx.seasonalLookupRaw(raw,f.cfg),raw,'source codes containing the marker are never rewritten');
  f.rule.active=false;
  const disabled=f.ctx.seasonalLookupRaw('TUV123 (l1) TET',f.cfg);
  assert.equal(f.ctx.C.adsContentLookupIdentity(f.ctx.C.extractDailyContentCode(f.ctx.C.stripMappedContentAnnotations(disabled,f.cfg.campaignNameConfig.contentSuffixRules))),'TUV123');
  assert(!f.apply('TUV123 (l1) TET').seasonal,'disabled marker is only a lookup annotation, never an output suffix/route');
});

test('missing/wrong subject links, malformed URLs, conflicting rules and reserved markers block matched rows',()=>{
  const f=fixture();delete f.rule.links.KHTN;
  assert(f.apply('TUV123 (KHTN) TET','KHTN').seasonal.errors.some(x=>x.includes('chưa có link riêng')));
  for(const url of ['javascript:alert(1)','/relative','https://user:pass@season.example/']){
    f.rule.links.KHTN=url;assert(f.apply('TUV123 (KHTN) TET','KHTN').seasonal.errors.some(x=>x.includes('URL http/https')));
  }
  const second={...f.rule,id:'other',marker:'NOEL',suffix:'NOEL'};
  assert(f.ctx.seasonalResolve('TUV123 (Toán) TET NOEL',[f.rule,second]).errors.length);
  assert(f.ctx.seasonalResolve('TUV123 (Toán) TET',[f.rule,{...f.rule,id:'duplicate'}]).errors.length);
  for(const marker of ['8B','L12','PXN'])assert(f.ctx.seasonalRuleErrors([{...f.rule,marker}]).length);
  for(const suffix of ['TET8B','TETL12','TETPXN'])assert(f.ctx.seasonalRuleErrors([{...f.rule,suffix}]).length);
  assert(!f.apply('TUV123 (KHTN)','KHTN').seasonal,'invalid/missing seasonal links cannot affect ordinary rows');
});

test('normal Build uses the exact original config/input; new markers are configuration, not hardcoded',()=>{
  const f=fixture(),normal=f.item(),input=f.ctx.seasonalBuildInput(normal,f.cfg);assert.equal(input.daily,normal);assert.equal(input.name,f.cfg.campaignNameConfig);
  f.rule.marker='HE';f.rule.suffix='HE2027';const row=f.apply('TUV123 (Toán) HE');assert.equal(row.seasonal.outputMixCode,'TUV123HE2027');
  assert(!f.apply('TUV123 (Toán) TET').seasonal);
});

test('Daily/report identities keep seasonal, ordinary, 8B and L12 codes separate',()=>{
  const f=fixture(),codes=['TUV123','TUV1238B','TUV123-L12','TUV1238B-L12','TUV123TET','TUV123TET8B','TUV123TET-L12','TUV123TET8B-L12'];
  const keys=codes.map(code=>f.ctx.C.superReportCodeKeyWithRules(code,'cd',f.ctx.C.DEFAULT_SUPER_REPORT_CODE_FILTER));assert.equal(new Set(keys).size,8);
  for(const subject of ['TOAN','KHTN'])for(const eight of [false,true]){
    const raw='TUV123 ('+subject+') TET'+(eight?' 8B':''),row=f.apply(raw,subject);row.rawContent=raw;row.source={mediaCode:'TUV123'};
    const expected='TUV123TET'+(eight?'8B':'')+(subject==='KHTN'?'-L12':'');
    assert.deepEqual(Array.from(f.ctx.dailyPermalinkCodes(row)),[expected]);
    const campaign='01/01/2027_*ThoLD*_'+row.seasonal.outputMixCode+row.seasonal.technicalSuffix+'_THCS--VIDEO';
    assert.equal(f.ctx.C.extractMetaReportCodeRaw(campaign,'cd'),row.seasonal.outputMixCode+row.seasonal.technicalSuffix);
  }
});
