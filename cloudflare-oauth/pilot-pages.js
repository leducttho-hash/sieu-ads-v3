/* Lucian #430 searchable select + #031 framed listbox · MIT (c) 2026 Seokwoooo.
 * Only Daily Page controls. The original selects/options and change handlers remain authoritative. */
let pilotPagePopup=null,pilotPageSerial=0;
function pilotPageSearchKey(value){return String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').trim().toLowerCase();}
function pilotPageAllowedOptions(select){
  const pages=registry().pages;
  return Array.from(select.options).filter(option=>!option.disabled&&!option.hidden).map(option=>{
    const page=pages.find(page=>page.pageId===option.value);
    return {value:option.value,label:option.textContent.trim(),name:page?.name||option.textContent.trim(),id:option.value};
  });
}
function pilotPageFilter(options,query){const q=pilotPageSearchKey(query);return options.filter(option=>!q||pilotPageSearchKey(option.name+' '+option.id).includes(q));}
function pilotPageClose(refocus=false){
  const state=pilotPagePopup;if(!state)return;pilotPagePopup=null;state.panel.remove();
  if(state.button.isConnected){state.button.setAttribute('aria-expanded','false');state.button.removeAttribute('aria-controls');if(refocus)state.button.focus({preventScroll:true});}
}
function pilotPagePosition(){
  const state=pilotPagePopup;if(!state||!state.button.isConnected){pilotPageClose();return;}
  const r=state.button.getBoundingClientRect(),width=Math.min(Math.max(r.width,300),window.innerWidth-24);
  const below=window.innerHeight-r.bottom-12,above=r.top-12,down=below>=Math.min(300,above),room=Math.max(0,down?below:above);
  const height=Math.min(360,window.innerHeight-24,room);
  state.panel.style.width=width+'px';state.panel.style.maxHeight=Math.max(80,height)+'px';
  state.panel.style.left=Math.max(12,Math.min(r.left,window.innerWidth-width-12))+'px';
  const actual=state.panel.getBoundingClientRect().height;
  state.panel.style.top=Math.max(12,Math.min(down?r.bottom+6:r.top-actual-6,window.innerHeight-actual-12))+'px';
}
function pilotPagePaintActive(){
  const state=pilotPagePopup;if(!state)return;
  const options=Array.from(state.list.querySelectorAll('[role="option"]'));
  options.forEach((option,i)=>option.classList.toggle('is-active',i===state.active));
  const active=options[state.active];if(active){state.input.setAttribute('aria-activedescendant',active.id);active.scrollIntoView?.({block:'nearest'});}else state.input.removeAttribute('aria-activedescendant');
}
function pilotPageRenderOptions(){
  const state=pilotPagePopup;if(!state)return;
  state.shown=pilotPageFilter(state.options,state.input.value);
  state.list.innerHTML=state.shown.map((option,index)=>`<div class="pilot-page-option" id="${state.uid}-option-${index}" role="option" data-pilot-page-option="${index}" aria-selected="${option.value===state.select.value}"><span class="pilot-page-avatar" aria-hidden="true">${esc(option.value?option.name.slice(0,1).toUpperCase():'–')}</span><span class="pilot-page-option-text"><b>${esc(option.name)}</b>${option.id?`<small>ID ${esc(option.id)}</small>`:'<small>Bỏ lựa chọn Page</small>'}</span><span class="pilot-page-check" aria-hidden="true">${option.value===state.select.value?'✓':''}</span></div>`).join('')||'<p class="pilot-page-empty">Không tìm thấy Page phù hợp.</p>';
  const selected=state.shown.findIndex(option=>option.value===state.select.value);state.active=state.input.value?(state.shown.length?0:-1):selected>=0?selected:state.shown.length?0:-1;
  state.live.textContent=state.shown.length+' lựa chọn';pilotPagePosition();pilotPagePaintActive();
}
function pilotPageCurrent(state){return !!state&&state===pilotPagePopup&&state.scope===capture()&&ui.view==='daily'&&state.select.isConnected&&state.button.isConnected;}
function pilotPageChoose(index){
  const state=pilotPagePopup;if(!pilotPageCurrent(state)){pilotPageClose();return;}
  const option=state.shown[index];if(!option)return;
  // Check the live native option again; the popup cannot introduce another Page or expand eligibility.
  const native=Array.from(state.select.options).find(item=>item.value===option.value&&!item.disabled&&!item.hidden);if(!native){pilotPageClose(true);return;}
  const value=state.select.value,row=state.select.dataset.row,scope=state.scope;pilotPageClose();
  if(value!==native.value){state.select.value=native.value;state.select.dispatchEvent(new Event('change',{bubbles:true}));}
  const button=Array.from(document.querySelectorAll('[data-pilot-page-trigger]')).find(button=>button.dataset.row===row);
  if(scope===capture()&&ui.view==='daily')button?.focus({preventScroll:true});
}
function pilotPageOpen(button){
  if(button.disabled)return;if(pilotPagePopup?.button===button){pilotPageClose(true);return;}pilotPageClose();
  const select=button.closest('.pilot-page-control')?.querySelector('select[data-field="pageId"]');if(!select||select.disabled||ui.view!=='daily')return;
  const panel=document.createElement('section'),uid='pilot-page-'+(++pilotPageSerial);panel.id=uid;panel.className='pilot-page-popup';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Chọn Page');
  panel.innerHTML=`<label class="pilot-page-search"><span aria-hidden="true">⌕</span><input type="search" role="combobox" aria-label="Tìm Page theo tên hoặc ID" aria-expanded="true" aria-autocomplete="list" aria-controls="${uid}-list" placeholder="Tìm tên hoặc ID Page…" autocomplete="off" spellcheck="false"></label><div class="pilot-page-list" id="${uid}-list" role="listbox" aria-label="Page trong Kho hiện tại"></div><p class="pilot-page-live" role="status" aria-live="polite"></p>`;
  document.body.append(panel);button.setAttribute('aria-expanded','true');button.setAttribute('aria-controls',uid);
  pilotPagePopup={button,select,panel,uid,scope:capture(),options:pilotPageAllowedOptions(select),shown:[],active:-1,input:panel.querySelector('input'),list:panel.querySelector('.pilot-page-list'),live:panel.querySelector('.pilot-page-live')};
  pilotPageRenderOptions();pilotPagePopup.input.focus({preventScroll:true});
}
function pilotPageTypeSelect(cell,pageSelect){
  return Array.from(cell.querySelectorAll('select')).find(select=>{
    if(select===pageSelect)return false;if(select.dataset.field==='pageTypeId')return true;
    try{return select.dataset.root==='work'&&JSON.parse(decodeURIComponent(select.dataset.path||'')).at(-1)==='pageTypeId';}catch{return false;}
  });
}
function pilotPageDecorate(){
  if(ui.view!=='daily')return;
  for(const select of document.querySelectorAll('#content select[data-row][data-field="pageId"]')){
    if(select.closest('.pilot-page-control'))continue;
    const cell=select.closest('td');if(!cell)continue;
    const type=pilotPageTypeSelect(cell,select),status=Array.from(cell.children).find(el=>el.tagName==='SMALL'),search=cell.querySelector('[data-page-search]');
    const selected=select.options[select.selectedIndex],name=selected?.textContent?.trim()||'Chọn Page',label=select.getAttribute('aria-label')||'Page';
    const group=document.createElement('div');group.className='pilot-page-control';cell.classList.add('pilot-page-cell');
    const button=document.createElement('button');button.type='button';button.className='pilot-page-trigger';button.dataset.pilotPageTrigger='';button.dataset.row=select.dataset.row;button.disabled=select.disabled;
    button.setAttribute('aria-label',label+': '+name);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');
    button.innerHTML=`<span class="pilot-page-avatar" aria-hidden="true">${esc(select.value?name.slice(0,1).toUpperCase():'–')}</span><span class="pilot-page-trigger-text"><small>Page</small><b>${esc(name)}</b></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>`;
    select.classList.add('pilot-page-native');select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');group.append(select,button);
    if(search){search.hidden=true;search.classList.add('pilot-page-native');group.append(search);}
    if(type){
      const typeBox=document.createElement('label');typeBox.className='pilot-page-type';const caption=document.createElement('span');caption.textContent='Loại Page';
      type.setAttribute('aria-label',label.replace(/^Page/,'Loại Page'));typeBox.append(caption,type);group.append(typeBox);
      if(status&&status.textContent.trim()!==type.options[type.selectedIndex]?.textContent.trim()){status.classList.add('pilot-page-status');group.append(status);}else if(status){status.hidden=true;status.classList.add('pilot-page-native');}
    }else if(status){const box=document.createElement('div');box.className='pilot-page-type-static';const caption=document.createElement('span');caption.textContent='Loại Page';box.append(caption,status);group.append(box);}
    cell.append(group);
  }
}
const pilotPageOriginalRender=render;
render=function(...values){pilotPageClose();const value=pilotPageOriginalRender(...values);pilotPageDecorate();return value;};
const pilotPageOriginalRefreshDaily=refreshDailyTableOnly;
refreshDailyTableOnly=function(...values){pilotPageClose();const value=pilotPageOriginalRefreshDaily(...values);pilotPageDecorate();return value;};
document.addEventListener('click',event=>{
  const trigger=event.target.closest?.('[data-pilot-page-trigger]');if(trigger){pilotPageOpen(trigger);return;}
  const option=event.target.closest?.('[data-pilot-page-option]');if(option&&pilotPagePopup?.panel.contains(option))pilotPageChoose(Number(option.dataset.pilotPageOption));
});
document.addEventListener('input',event=>{if(event.target===pilotPagePopup?.input)pilotPageRenderOptions();});
document.addEventListener('pointermove',event=>{const option=event.target.closest?.('[data-pilot-page-option]');if(option&&pilotPagePopup?.panel.contains(option)){const active=Number(option.dataset.pilotPageOption);if(active!==pilotPagePopup.active){pilotPagePopup.active=active;pilotPagePaintActive();}}});
document.addEventListener('pointerdown',event=>{if(pilotPagePopup&&!pilotPagePopup.panel.contains(event.target)&&!pilotPagePopup.button.contains(event.target))pilotPageClose();});
document.addEventListener('keydown',event=>{
  const trigger=event.target.closest?.('[data-pilot-page-trigger]');if(trigger&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();pilotPageOpen(trigger);return;}
  const state=pilotPagePopup;if(!state||!state.panel.contains(event.target)||event.altKey||event.ctrlKey||event.metaKey)return;
  const length=state.shown.length;
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();if(!length)return;
    state.active=event.key==='Home'?0:event.key==='End'?length-1:(state.active+(event.key==='ArrowDown'?1:-1)+length)%length;pilotPagePaintActive();
  }else if(event.key==='Enter'){event.preventDefault();if(state.active>=0)pilotPageChoose(state.active);}
  else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();pilotPageClose(true);}
  else if(event.key==='Tab'){
    const focusable=Array.from(document.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')).filter(el=>el.tabIndex>=0&&!el.disabled&&el.getClientRects().length&&!state.panel.contains(el));
    const next=event.shiftKey?state.button:focusable[focusable.indexOf(state.button)+1];event.preventDefault();pilotPageClose();(next||state.button).focus({preventScroll:true});
  }
});
document.addEventListener('focusin',event=>{const state=pilotPagePopup;if(state&&!state.panel.contains(event.target)&&event.target!==state.button)pilotPageClose();});
document.addEventListener('scroll',event=>{if(pilotPagePopup&&!pilotPagePopup.panel.contains(event.target))pilotPageClose();},true);
window.addEventListener('resize',pilotPagePosition);
window.addEventListener('pagehide',()=>pilotPageClose());
