/* Same-origin broker adapter. Stores session summaries only in memory; no Google tokens. */
window.SieuGoogleBackend=(()=>{
 'use strict';const cache=new Map(),active=new Set(),bodyLeases=new Map();let configuration=null,problem='',pending=null,generation=0;
 const abortError=()=>new DOMException('Đã hủy kết nối Google.','AbortError');
 const endpoint=(path,profile)=>'/auth/'+path+(profile?'?profile='+encodeURIComponent(profile):'');
 async function api(path,{profile,method='GET',body,csrf,signal,keepAlive=false}={}){
  const controller=new AbortController();active.add(controller);let held=false;const timeout=setTimeout(()=>controller.abort(),keepAlive?60000:30000),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});const cleanup=()=>{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);active.delete(controller);};
  try{const response=await fetch(endpoint(path,profile),{method,credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{...(body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal});
   if(!response.ok){let error;try{error=await response.json();}catch{}if(response.status===401&&profile)cache.delete(profile);throw Object.assign(Error(error?.message||'Chưa kết nối được backend Google. Catalog cũ được giữ.'),{status:response.status});}if(keepAlive){held=true;bodyLeases.set(response,cleanup);}return response;
  }catch(e){if(e.name==='AbortError')throw e;if(e instanceof TypeError)throw Error('Chưa kết nối được backend Google. Catalog cũ được giữ.');throw e;}finally{if(!held)cleanup();}
 }
 async function session(profile){try{const response=await api('session',{profile}),value=await response.json();if(value.profile!==profile||!value.connected||!value.csrf)throw Error('Phiên backend chưa hợp lệ.');cache.set(profile,value);return value;}catch(e){cache.delete(profile);throw e;}}
 const ready=(async()=>{try{const response=await api('config'),value=await response.json();if(!value.enabled||!Array.isArray(value.profiles))throw Error('Backend chưa sẵn sàng.');configuration=value;await Promise.all(value.profiles.map(p=>session(p).catch(()=>null)));}catch(e){problem=e.message;}})();
 function status(profile){const value=cache.get(profile);if(!value||value.until<=Date.now()){cache.delete(profile);return null;}return {email:value.email,excel:value.excel,until:value.until};}
 function abort(){generation++;for(const task of active)task.abort();active.clear();for(const cleanup of bodyLeases.values())cleanup();bodyLeases.clear();if(pending){pending.cancel();pending=null;}}
 function forget(){abort();cache.clear();}
 function connect({profile,excel=false}){
  if(!configuration)return Promise.reject(Error(problem||'Backend đang tải. Đợi một chút rồi thử lại.'));
  if(!configuration.profiles.includes(profile))return Promise.reject(Error('Hồ sơ chưa được cấu hình trên backend thử nghiệm.'));
  if(pending)return Promise.reject(Error('Đang chờ cửa sổ kết nối Google.'));
  // Called directly from the existing user gesture; do not await before opening the popup.
  const popup=window.open(endpoint('start',profile)+(excel?'&excel=1':''),'sieuads-google-'+profile,'popup,width=540,height=720');if(!popup)return Promise.reject(Error('Trình duyệt chặn cửa sổ Google. Cho phép popup rồi thử lại.'));
  const ticket=generation;
  return new Promise((resolve,reject)=>{let finished=false,settling=false;const finish=(error,value)=>{if(finished)return;finished=true;window.removeEventListener('message',message);clearInterval(watch);clearTimeout(timer);if(pending?.popup===popup)pending=null;try{popup.close();}catch{}error?reject(error):resolve(value);};
   const message=async event=>{if(event.origin!==location.origin||event.source!==popup||event.data?.type!=='sieuads-oauth-result'||event.data.profile!==profile)return;if(ticket!==generation){finish(abortError());return;}if(!event.data.ok){finish(Error(event.data.message||'Chưa kết nối được Google.'));return;}settling=true;try{await session(profile);if(ticket!==generation){finish(abortError());return;}finish(null,status(profile));}catch(error){finish(error);}};
   const watch=setInterval(()=>{if(popup.closed&&!settling)finish(Error('Cửa sổ Google đã đóng. Nếu vừa cấp quyền thành công, bấm Đồng bộ lại.'));},400),timer=setTimeout(()=>finish(Error('Kết nối Google quá thời gian. Bấm lại khi sẵn sàng.')),300000);
   pending={popup,cancel:()=>finish(abortError())};window.addEventListener('message',message);
  });
 }
 async function ensure(ctx){const ticket=generation,prior=status(ctx.profile);if(prior&&(!ctx.excel||prior.excel))return prior;try{await session(ctx.profile);if(ticket!==generation)throw abortError();const restored=status(ctx.profile);if(restored&&(!ctx.excel||restored.excel))return restored;}catch(error){if(error.name==='AbortError'||ticket!==generation)throw abortError();}if(ticket!==generation)throw abortError();return connect(ctx);}
 async function request(url,ctx,{binary=false,source=null}={}){const sessionData=cache.get(ctx.profile);if(!sessionData)throw Error('Kết nối Google cho hồ sơ này trước khi đọc nguồn.');const response=await api('read',{profile:ctx.profile,method:'POST',csrf:sessionData.csrf,keepAlive:true,body:{url:String(url),source:source?{id:source.id,resourceKey:source.resourceKey||''}:null}});
  try{const limit=20*1024*1024;if(Number(response.headers.get('content-length'))>limit)throw Error('Nguồn vượt giới hạn 20 MB; Catalog cũ được giữ.');
  const reader=response.body?.getReader?.(),parts=[];let count=0;if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>limit)throw Error('Nguồn vượt giới hạn 20 MB; Catalog cũ được giữ.');parts.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}}else{const chunk=new Uint8Array(await response.arrayBuffer());count=chunk.byteLength;if(count>limit)throw Error('Nguồn vượt giới hạn 20 MB; Catalog cũ được giữ.');parts.push(chunk);}
  const all=new Uint8Array(count);let offset=0;for(const chunk of parts){all.set(chunk,offset);offset+=chunk.length;}if(binary)return all.buffer;try{return JSON.parse(new TextDecoder().decode(all));}catch{throw Error('Nguồn chưa trả dữ liệu hợp lệ. Catalog cũ được giữ.');}}finally{bodyLeases.get(response)?.();bodyLeases.delete(response);}
 }
 async function disconnect(ctx){const value=cache.get(ctx.profile);if(!value)return;await api('disconnect',{profile:ctx.profile,method:'POST',csrf:value.csrf,body:{}});cache.delete(ctx.profile);}
 async function logout(){await ready;if(!configuration)throw Error(problem||'Chưa kiểm tra được phiên đăng nhập.');for(const profile of configuration.profiles){try{const value=status(profile)?cache.get(profile):await session(profile);await api('logout',{profile,method:'POST',csrf:value.csrf,body:{}});forget();return;}catch(error){if(error.status!==401)throw error;}}forget();}
 // Delegated so the header may be rebuilt without reconnecting handlers or polling.
 document.addEventListener('click',async event=>{const button=event.target.closest?.('[data-pilot-logout]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();if(button.disabled)return;button.disabled=true;const status=document.getElementById('pilot-logout-status');if(status)status.textContent='Đang đăng xuất…';try{await logout();location.replace('/login');}catch(error){button.disabled=false;if(status)status.textContent=error.message||'Chưa đăng xuất được.';}},true);
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
 return {enabled:true,ready,logout,get profiles(){return [...cache.keys()].filter(p=>status(p));},get clientId(){return configuration?.clientId||'';},get problem(){return problem;},status,connect,ensure,request,disconnect,forget,abort,account:async ctx=>(await session(ctx.profile)).email};
})();
