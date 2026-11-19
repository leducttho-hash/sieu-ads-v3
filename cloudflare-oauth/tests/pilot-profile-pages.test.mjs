import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
const core=scripts.find(match=>/\bid="core"/.test(match[1]))[2];
const app=scripts.find(match=>match[2].includes('function normalizedFive()'))[2];
const seed=JSON.parse(scripts.find(match=>/\bid="seed"/.test(match[1]))[2]);
function source(name){
  const match=new RegExp('^(?:async )?function '+name+'\\(','m').exec(app);
  assert(match,'Application function missing: '+name);
  const rest=app.slice(match.index),lineEnd=rest.indexOf('\n');
  const next=rest.slice(lineEnd+1).search(/^(?:(?:async )?function |const |let |window\.|document\.)/m);
  return next<0?rest:rest.slice(0,lineEnd+1+next);
}
function fixture(uid,wid,ch){
  const who=structuredClone(seed.users.find(u=>u.id===uid));
  const reg=who.registries[wid],warehouse={id:wid,layout:['contentCode','caption','mediaCode','mixCode','pageRaw']};
  const ctx=vm.createContext({structuredClone,user:()=>who,wh:()=>warehouse,registry:()=>reg,
    db:{session:{channel:ch}},canon:v=>String(v??'').normalize('NFKC').trim().toUpperCase(),
    args:JSON.stringify,esc:v=>String(v??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),
  });
  vm.runInContext(core+';var C=SieuCore.default;const _regTokenCache=new WeakMap();',ctx);
  for(const name of ['cleanCodeToken','getRegTokens','profilePageRoutingEnabled','profilePageTypeMatches','profilePageEvidence','profilePageControl','profileSourcePageTypes','mapRawFiveRow','manualPage'])vm.runInContext(source(name),ctx);
  return {ctx,reg,who,warehouse,row:label=>ctx.mapRawFiveRow(['TEXT1','Caption','IMAGE1','TEXT1IMAGE1',label],0,warehouse.layout)};
}

test('mapping is enabled only for My/Huyen and their original warehouse/channel scopes',()=>{
  for(const uid of ['Mynnh','Huyenbtt'])for(const [wid,ch]of [['tieu-hoc','CD'],['gia-su-toan-khtn','MESS']]){
    const f=fixture(uid,wid,ch);assert(f.ctx.profilePageRoutingEnabled());
    f.ctx.db.session.channel=ch==='CD'?'MESS':'CD';assert(!f.ctx.profilePageRoutingEnabled());
    f.warehouse.id='thcs';assert(!f.ctx.profilePageRoutingEnabled());
  }
  const f=fixture('ThoLD','thcs','CD');assert(!f.ctx.profilePageRoutingEnabled());
});

for(const uid of ['Mynnh','Huyenbtt'])for(const [wid,ch]of [['tieu-hoc','CD'],['gia-su-toan-khtn','MESS']]){
  test(`${uid}/${ch}: source types survive sync labels, candidates and Page selection`,()=>{
    const f=fixture(uid,wid,ch),snapshot=JSON.stringify(f.who);
    for(const type of f.reg.pageTypes.filter(t=>t.isActive)){
      const pages=f.reg.pages.filter(p=>p.isActive&&f.ctx.C.registryPageTypeIds(p).includes(type.typeId));
      for(const label of [type.name,type.name.replace(/\s*\/\s*/g,'/'),type.name+' (Cap no Media)']){
        const row=f.row(label);
        assert.equal(row.pageRaw,label,'raw source text retained');
        assert.equal(row.companyPage.pageType,type.code,'whole configured type normalized to stable code');
        const result=f.ctx.C.resolveRegistryPage(f.reg,row.companyPage);
        assert.deepEqual(Array.from(result.candidatePageIds).sort(),pages.map(p=>p.pageId).sort());
        if(pages.length===1)assert.equal(result.selection?.pageId,pages[0].pageId);
        else {assert.equal(result.status,'AMBIGUOUS');assert.equal(result.selection,null,'no arbitrary default');}
        const item={id:'row',contentCode:'TEXT1',override:{},source:row,pageSelection:result.selection};
        const control=f.ctx.profilePageControl(item),pageSelect=control.split('</select>')[0];
        for(const p of f.reg.pages.filter(p=>p.isActive))assert.equal(pageSelect.includes('value="'+p.pageId+'"'),pages.some(q=>q.pageId===p.pageId));
        assert(control.includes('value="'+type.typeId+'" selected'),'type shown before Page choice');
        if(pages.length){
          const picked=f.ctx.manualPage({pageId:pages[0].pageId},f.reg,row.companyPage);
          assert.equal(picked?.pageTypeId,type.typeId);assert.equal(picked.pageId,pages[0].pageId);
        }
      }
    }
    assert.equal(JSON.stringify(f.who),snapshot,'mapping does not rewrite user settings or registry');
  });
}

test('explicit Page IDs/names, unknown types, inactive types and incompatible manual choices stay distinct',()=>{
  const f=fixture('Huyenbtt','gia-su-toan-khtn','MESS');
  for(const p of f.reg.pages){
    assert.equal(f.row(p.pageId).companyPage.pageId,p.pageId);
    assert.equal(f.row(p.name).companyPage.page,p.name);
  }
  const unknown=f.row('Loại không tồn tại');assert.equal(f.ctx.C.resolveRegistryPage(f.reg,unknown.companyPage).status,'UNKNOWN');
  const type=f.reg.pageTypes[0];type.isActive=false;
  assert.notEqual(f.ctx.C.resolveRegistryPage(f.reg,f.row(type.name).companyPage).status,'RESOLVED');
  const p=f.reg.pages[0],other=f.reg.pageTypes.find(t=>t.isActive&&!f.ctx.C.registryPageTypeIds(p).includes(t.typeId));
  assert(other);assert.equal(f.ctx.manualPage({pageId:p.pageId,pageTypeId:other.typeId},f.reg,{}),null);
});

test('manual type correction can change the source group or show all own-profile Pages',()=>{
  const f=fixture('Huyenbtt','gia-su-toan-khtn','MESS'),type=f.reg.pageTypes[0];
  const item={id:'row',contentCode:'TEXT1',override:{},source:f.row(type.name)};
  const other=f.reg.pageTypes.find(t=>t.typeId!==type.typeId);
  const initial=f.ctx.profilePageControl(item);assert(initial.includes('value="'+other.typeId+'"'),'other types remain selectable');
  item.override={pageId:'',pageTypeId:other.typeId};
  let control=f.ctx.profilePageControl(item).split('</select>')[0];
  for(const p of f.reg.pages)assert.equal(control.includes('value="'+p.pageId+'"'),f.ctx.C.registryPageTypeIds(p).includes(other.typeId));
  item.override={pageId:'',pageTypeId:''};control=f.ctx.profilePageControl(item).split('</select>')[0];
  for(const p of f.reg.pages)assert(control.includes('value="'+p.pageId+'"'));
});
