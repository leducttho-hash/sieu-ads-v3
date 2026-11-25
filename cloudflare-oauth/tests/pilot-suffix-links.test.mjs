import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
const core=scripts.find(x=>/\bid="core"/.test(x[1]))[2];
const app=scripts.find(x=>x[2].includes('function reportData()'))[2];
const seed=JSON.parse(scripts.find(x=>/\bid="seed"/.test(x[1]))[2]);
function source(name){
  const start=app.search(new RegExp('^(?:async )?function '+name+'\\(','m'));assert(start>=0,name);
  const rest=app.slice(start),line=rest.indexOf('\n'),next=rest.slice(line+1).search(/^(?:(?:async )?function |const |let |window\.|document\.)/m);
  return next<0?rest:rest.slice(0,line+1+next);
}
function fixture(uid='Mynnh',channel='CD'){
  const who=structuredClone(seed.users.find(u=>u.id===uid));let daily=[];
  const report={sources:[],crmPaste:'',links:'',mappings:{},linkMappings:{},rejectedLinks:[],ack:[]};
  const ctx=vm.createContext({URL,structuredClone,user:()=>who,wh:()=>({id:'tieu-hoc'}),report:()=>report,workspace:()=>({}),db:{session:{channel}},compute:()=>daily,
    key:(...x)=>x.join('|'),canon:x=>String(x??'').toUpperCase(),subjectKey:x=>String(x??'').toUpperCase(),clone:structuredClone,
    fingerprint:JSON.stringify,pendingImports:[],reportCache:null});
  vm.runInContext(core+';var C=SieuCore.default;',ctx);
  for(const name of ['seasonalRules','seasonalKey','seasonalRuleErrors','seasonalResolve','seasonalTag','seasonalLookupRaw','seasonalIdentity','cdLinkCode','dailyPermalinkCodes','resolveDailyCdPermalink','cdMediaMatchesMix','resolveCdReportLinkRows','filterSelectedDailyGeneratedLinks','pullSelectedDailyCdLinks','rk','displayCode','crmData','reportData'])vm.runInContext(source(name),ctx);
  const C=ctx.C;
  report.profile=C.defaultReportProfile(channel==='CD'?'cd':'mess');
  return {ctx,C,who,report,setDaily(rows){daily=rows;ctx.reportCache=null;},data(){ctx.reportCache=null;return ctx.reportData();}};
}
const campaign=(uid,code)=>`25/11/2026_*${uid}*_${code}-PXN_TIEUHOC--VIDEO`;
const row=(raw,media='TYV434',mix='TYC100TYV434')=>({selected:true,rawContent:raw,contentCode:media,mixCode:mix,source:{mediaCode:media},subject:'L2021',campaignSuffix:'-PXN'});

test('My and Huyen: actual (2021) examples use L2021 for both MIX and Media aliases',()=>{
  for(const uid of ['Mynnh','Huyenbtt'])for(const media of ['TYV434','LKV452']){
    const f=fixture(uid),mix='TYC100'+media,r=row(`${media} (2021)`,media,mix);
    assert.deepEqual(Array.from(f.ctx.dailyPermalinkCodes(r)),[mix+'L2021',media+'L2021']);
    const mappings=[{adName:campaign(uid,mix+'L2021'),permalink:'https://example.test/2021'},
      {adName:campaign(uid,mix),permalink:'https://example.test/ordinary'}];
    assert.equal(f.ctx.resolveDailyCdPermalink(r,mappings).permalink,'https://example.test/2021');
    assert.equal(f.ctx.resolveDailyCdPermalink(r,mappings.slice(1)).status,'NONE');
  }
});

test('same configured suffix is recognized inside/outside parentheses without code-substring matches',()=>{
  const f=fixture(),rules=f.who.config.campaignNameConfig.contentSuffixRules;
  for(const raw of ['TYV434 (2021)','TYV434 2021','TYV434 (Toán) 2021','TYV434 2021. (Toán)','TYV434 (２０２１)','TYV434 (20\u200B21)']){
    assert.equal(f.C.contentIdentityWithSuffix('TYV434',raw,rules),'TYV434L2021',raw);
    assert.equal(f.C.adsContentLookupIdentity(f.C.extractDailyContentCode(f.C.stripMappedContentAnnotations(raw,rules))),'TYV434',raw);
  }
  for(const raw of ['TYV2021','TYV434 NOT2021','TYV434 20210','TYV434 (20210)'])assert.equal(f.C.resolveContentSuffix(raw,rules).suffix,'',raw);
});

test('suffix conversion stays idempotent before 8B/L12 and new configured markers need no code changes',()=>{
  const f=fixture(),rules=f.who.config.campaignNameConfig.contentSuffixRules;
  for(const eight of ['', '8B'])for(const tail of ['', '-L12']){
    const expected='TYV434L2021'+eight+tail;
    assert.equal(f.C.contentIdentityWithSuffix('TYV434'+eight+tail,'TYV434 (2021)',rules),expected);
    assert.equal(f.C.contentIdentityWithSuffix(expected,'TYV434 (2021) 2021',rules),expected);
    assert.equal(f.ctx.cdLinkCode(expected),expected);
  }
  for(const [marker,suffix]of [['l1','L2020'],['l2','L2023']])assert.equal(f.C.contentIdentityWithSuffix('TYV434',`TYV434 (${marker})`,rules),'TYV434'+suffix);
  rules.push({id:'future',marker:'SPRING',suffix:'SPRING2028',active:true});
  for(const raw of ['TYV434 (SPRING)','TYV434 SPRING'])assert.equal(f.ctx.dailyPermalinkCodes(row(raw))[0],'TYC100TYV434SPRING2028');
});

test('Daily to report carries L2021, keeps ordinary/8B/L12 links and CRM metrics independent',()=>{
  for(const uid of ['Mynnh','Huyenbtt']){
    const f=fixture(uid),mix='TYC100TYV434';
    const codes=[mix,mix+'L2021',mix+'L20218B',mix+'L2021-L12'];
    f.report.sources=[f.C.aggregatePositiveMetaRows({name:'Meta',mode:'cd',mapping:{code:0,spend:1,result:2},rows:codes.map((code,i)=>({cells:[campaign(uid,code),100*(i+1),i+1],rowNumber:i+2}))})];
    f.report.crmPaste='Mã\tSố Contacts\tSố đơn\tDoanh thu\n'+codes.map((code,i)=>[code,10*(i+1),i+1,1000*(i+1)].join('\t')).join('\n');
    const r=row('TYV434 (2021)');r.postPermalink='https://example.test/2021';f.setDaily([r]);
    f.ctx.pullSelectedDailyCdLinks(f.report);f.ctx.pullSelectedDailyCdLinks(f.report);
    assert.equal(f.C.parseSuperReportLinkPaste(f.report.links).rows.length,1);
    const d=f.data(),hit=d.rows.find(r=>r.code===mix+'L2021');
    assert.equal(hit.links,r.postPermalink);assert.equal(hit.contacts,20);assert.equal(hit.orders,2);assert.equal(hit.revenue,2000);
    assert.equal(d.rows.length,4);assert(d.rows.filter(r=>r.code!==mix+'L2021').every(r=>!r.links));
    assert.equal(d.pre.errors.length,0);
  }
});

test('report also normalizes annotated pasted Media links to the single correct MIX target',()=>{
  const f=fixture(),rows=[{id:'a',rawName:'TYV434 (2021)',permalink:'https://example.test/2021',source:'paste',row:1}];
  const targets=['TYC100TYV434','TYC100TYV434L2021'];
  const normalized=f.ctx.resolveCdReportLinkRows(rows,targets,[]);
  const result=f.C.compileSuperReportLinkSource({mode:'cd',rows:normalized,targetCodes:targets,rules:f.who.reportRules});
  assert.equal(result.entriesByCode.get('TYC100TYV434L2021')?.links[0],rows[0].permalink);
  assert(!result.entriesByCode.has('TYC100TYV434'));
});

test('configured seasonal markers work in/out of parentheses and preserve future custom suffix identities',()=>{
  const f=fixture();
  f.who.config.campaignNameConfig.seasonalRulesByWarehouse={'tieu-hoc':[
    {id:'tet',marker:'TET',suffix:'TET',active:true,links:{}},
    {id:'noel',marker:'NOEL',suffix:'NOEL',active:true,links:{}},
    {id:'future',marker:'HE',suffix:'HE2027',active:true,links:{}}
  ]};
  for(const [marker,suffix]of [['TET','TET'],['NOEL','NOEL'],['HE','HE2027']])for(const raw of [`TYV434 (${marker})`,`TYV434 ${marker}`,`TYV434 (2021) (${marker})`,`TYV434 2021 ${marker}`]){
    const legacy=raw.includes('2021')?'L2021':'',want='TYC100TYV434'+legacy+suffix;
    assert.equal(f.ctx.seasonalResolve(raw,f.ctx.seasonalRules(f.who.config)).matched,true,raw);
    assert.equal(f.ctx.dailyPermalinkCodes(row(raw))[0],want,raw);
    const maps=[{adName:campaign('Mynnh',want),permalink:'https://example.test/'+suffix}];
    assert.equal(f.ctx.resolveDailyCdPermalink(row(raw),maps).status,'ONE',raw);
  }
  assert.equal(f.ctx.seasonalResolve('TYV434TET (Toán)',f.ctx.seasonalRules(f.who.config)).matched,false);
});

test('ambiguity, disabled rules and scope isolation never fall back to an unrelated link',()=>{
  const f=fixture(),r=row('TYV434 (2021)'),mix='TYC100TYV434';
  assert.equal(f.ctx.resolveDailyCdPermalink(r,[{adName:mix+'L2021',permalink:'https://a.test'}, {adName:mix+'L2021',permalink:'https://b.test'}]).status,'AMBIGUOUS');
  assert.equal(f.ctx.resolveDailyCdPermalink({...r,rawContent:'TYV434 (2021) (l1)'},[{adName:mix,permalink:'https://a.test'}]).status,'NONE');
  const th=fixture('ThoLD');assert.equal(th.ctx.dailyPermalinkCodes(r)[0],mix,'other profile has no 2021 conversion');
  f.who.config.campaignNameConfig.contentSuffixRules.find(r=>r.marker==='2021').active=false;
  assert.equal(f.ctx.dailyPermalinkCodes(r)[0],mix);
});

test('seasonal conflicts, different warehouses and unconfigured markers cannot create extra aliases',()=>{
  const f=fixture(),cfg=f.who.config.campaignNameConfig;
  cfg.seasonalRulesByWarehouse={'tieu-hoc':[{id:'a',marker:'TET',suffix:'TET',active:true},{id:'b',marker:'NOEL',suffix:'NOEL',active:true}]};
  assert.equal(f.ctx.dailyPermalinkCodes(row('TYV434 (TET) NOEL')).length,0);
  assert.equal(f.ctx.cdLinkCode('TYV434 (TET)'), 'TYV434TET');
  cfg.seasonalRulesByWarehouse={thcs:cfg.seasonalRulesByWarehouse['tieu-hoc']};
  assert.equal(f.ctx.cdLinkCode('TYV434 (TET)'), 'TYV434');
  assert.equal(f.ctx.resolveDailyCdPermalink(row('TYV434 (TET)'),[{adName:'TYC100TYV434TET',permalink:'https://a.test'}]).status,'NONE');
});
