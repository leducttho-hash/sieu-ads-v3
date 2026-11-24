/** Server-side access gate. No app bundle or source data is embedded in the login page. */
const labels={ThoLD:'Thọ',Mynnh:'My',Huyenbtt:'Huyền'};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const publicPaths=new Set(['/about','/about/','/about/index.html','/privacy','/privacy/','/privacy/index.html','/terms','/terms/','/terms/index.html','/site.css']);

export function loginPage(cfg,headers,nonce){
 const options=Object.keys(cfg.users).map(profile=>`<option value="${escape(profile)}">${escape(labels[profile]||profile)}</option>`).join('');
 return new Response(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Đăng nhập · Siêu Ads</title><style nonce="${nonce}">
 :root{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17252b;background:#f4f7f8}*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px}main{width:min(100%,400px);padding:32px;background:#fff;border:1px solid #dfe8e9;border-radius:20px;box-shadow:0 16px 48px #1733340a}.brand{color:#087e78;font-size:13px;font-weight:750;letter-spacing:.12em}h1{font-size:27px;line-height:1.2;margin:14px 0 10px}p{font-size:14px;line-height:1.55;color:#65767d;margin:0 0 24px}label{display:block;font-size:13px;font-weight:650;margin-bottom:8px}select,button{width:100%;min-height:48px;border-radius:10px;font:inherit}select{border:1px solid #cfdbdf;background:white;padding:0 12px;color:inherit}button{margin-top:14px;padding:12px;border:0;background:#087e78;color:white;font-size:14px;font-weight:650;cursor:pointer}button:disabled{opacity:.6;cursor:wait}select:focus-visible,button:focus-visible{outline:3px solid #7ad8cf;outline-offset:3px}#status{font-size:13px;line-height:1.5;min-height:20px;margin:14px 0 0;overflow-wrap:anywhere;color:#9e3535}footer{display:flex;gap:16px;margin-top:24px;font-size:11px}a{color:#64767d}
 </style></head><body><main><div class="brand">SIÊU ADS</div><h1>Đăng nhập</h1><p>Dùng tài khoản Google đã được cấp quyền để vào chương trình.</p><label for="profile">Hồ sơ</label><select id="profile">${options}</select><button id="login" type="button">Đăng nhập bằng Google</button><p id="status" role="status" aria-live="polite"></p><noscript>Cần bật JavaScript để đăng nhập.</noscript><footer><a href="/privacy/">Quyền riêng tư</a><a href="/terms/">Điều khoản</a></footer></main><script nonce="${nonce}">
 const button=document.getElementById('login'),select=document.getElementById('profile'),status=document.getElementById('status');let pending=null;
 button.addEventListener('click',()=>{if(pending)return;const profile=select.value,popup=window.open('/auth/start?profile='+encodeURIComponent(profile),'sieuads-app-login','popup,width=540,height=720');if(!popup){status.textContent='Cho phép cửa sổ bật lên rồi thử lại.';return;}button.disabled=true;select.disabled=true;status.textContent='Đang chờ đăng nhập Google…';let settling=false,finished=false;
 const finish=message=>{if(finished)return;finished=true;window.removeEventListener('message',receive);clearInterval(watch);clearTimeout(timer);pending=null;button.disabled=false;select.disabled=false;status.textContent=message;try{popup.close();}catch{}};
 const receive=async event=>{if(event.origin!==location.origin||event.source!==popup||event.data?.type!=='sieuads-oauth-result'||event.data.profile!==profile)return;if(!event.data.ok){finish(event.data.message||'Chưa đăng nhập được.');return;}if(settling)return;settling=true;try{const response=await fetch('/auth/session?profile='+encodeURIComponent(profile),{credentials:'same-origin',cache:'no-store',redirect:'error'});const value=await response.json();if(!response.ok||!value.connected||value.profile!==profile)throw Error();finish('Đã đăng nhập. Đang mở chương trình…');location.replace('/');}catch{finish('Chưa xác nhận được phiên đăng nhập. Thử lại.');}};
 const watch=setInterval(()=>{if(popup.closed&&!settling)finish('Cửa sổ đăng nhập đã đóng. Bấm lại khi sẵn sàng.');},400),timer=setTimeout(()=>finish('Đăng nhập quá thời gian. Thử lại.'),300000);pending={popup};window.addEventListener('message',receive);
 });window.addEventListener('pagehide',()=>{try{pending?.popup.close();}catch{}});
 </script></body></html>`,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`}});
}

export async function application(req,env,cfg,{common,cookieName,readCookie,session,fail,loginNonce}){
 const url=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))fail(405,'METHOD_DENIED','Thao tác chưa được hỗ trợ.');
 if(publicPaths.has(url.pathname))return env.ASSETS.fetch(req);
 let viewer=null;
 for(const profile of Object.keys(cfg.users)){
  if(!/^[a-f0-9]{64}$/.test(readCookie(req,cookieName('session',profile))))continue;
  try{viewer=await session(req,env,cfg,profile);break;}
  catch(error){if(error.status!==401)throw error;}
 }
 if(!viewer){
  if(!['/','/index.html','/login','/login/'].includes(url.pathname))fail(401,'LOGIN_REQUIRED','Đăng nhập để vào chương trình.');
  const response=loginPage(cfg,common,loginNonce());return req.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
 }
 if(url.pathname==='/login'||url.pathname==='/login/')return new Response(null,{status:302,headers:{...common,Location:'/'}});
 const asset=await env.ASSETS.fetch(req),headers=new Headers(asset.headers);
 for(const [key,value] of Object.entries(common))headers.set(key,value);
 // Never allow a shared/browser asset cache to bypass a later logout or revocation.
 headers.delete('ETag');headers.delete('Last-Modified');headers.delete('Expires');
 return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
}
