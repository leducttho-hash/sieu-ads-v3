/** Same-origin OAuth pilot. No OAuth credentials are returned to the browser or logged. */
const SHEETS='https://www.googleapis.com/auth/spreadsheets.readonly';
const DRIVE='https://www.googleapis.com/auth/drive.readonly';
const LIMIT=20*1024*1024;
const encoder=new TextEncoder(),decoder=new TextDecoder();
class SafeError extends Error { constructor(status,code,message){super(message);this.status=status;this.code=code;} }
const fail=(status,code,message)=>{throw new SafeError(status,code,message);};
const bytes=n=>crypto.getRandomValues(new Uint8Array(n));
const hex=buffer=>[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
const random=()=>hex(bytes(32));
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
function b64url(buffer){return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unb64(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));}
const now=()=>Date.now();
const common={'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'};
function json(value,status=200,headers={}){return new Response(JSON.stringify(value),{status,headers:{...common,'Content-Type':'application/json; charset=utf-8',...headers}});}
function cookieName(kind,profile){return '__Host-sieuads_'+kind+'_'+profile;}
function cookie(name,value,maxAge,sameSite='Strict'){return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}`;}
function readCookie(req,name){const match=(req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));return match?.slice(name.length+1)||'';}
function config(env){
 let origin,users,key;
 try{origin=new URL(env.APP_ORIGIN);}catch{fail(503,'NOT_CONFIGURED','APP_ORIGIN thiếu hoặc không phải địa chỉ HTTPS hợp lệ. Kiểm tra Runtime variables của Worker.');}
 if(origin.protocol!=='https:'||origin.origin!==env.APP_ORIGIN)fail(503,'NOT_CONFIGURED','APP_ORIGIN phải là origin HTTPS của bản pilot, không có đường dẫn hoặc dấu / cuối.');
 if(!env.ALLOWED_USERS)fail(503,'NOT_CONFIGURED','Thiếu secret ALLOWED_USERS trong Runtime Production của Worker.');
 try{users=JSON.parse(env.ALLOWED_USERS);}catch{fail(503,'NOT_CONFIGURED','ALLOWED_USERS không phải JSON hợp lệ. Dán nguyên đối tượng JSON với dấu ngoặc kép thẳng, không kèm khung mã.');}
 if(!users||Array.isArray(users)||typeof users!=='object'||!Object.keys(users).length)fail(503,'NOT_CONFIGURED','ALLOWED_USERS phải là đối tượng JSON ánh xạ mã hồ sơ tới danh sách email.');
 for(const [profile,emails] of Object.entries(users))if(!/^[\w-]{1,64}$/.test(profile)||!Array.isArray(emails)||!emails.length||emails.some(x=>typeof x!=='string'||!/^\S+@\S+\.\S+$/.test(x)))fail(503,'NOT_CONFIGURED','ALLOWED_USERS có mã hồ sơ hoặc danh sách email chưa hợp lệ. Mỗi hồ sơ cần một mảng email không rỗng.');
 if(!/^[-\w]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID||''))fail(503,'NOT_CONFIGURED','GOOGLE_CLIENT_ID thiếu hoặc sai định dạng. Kiểm tra Client ID đầy đủ trong Runtime Production, không có khoảng trắng.');
 if(!env.GOOGLE_CLIENT_SECRET)fail(503,'NOT_CONFIGURED','Thiếu secret GOOGLE_CLIENT_SECRET trong Runtime Production của Worker.');
 if(!env.TOKEN_ENCRYPTION_KEY)fail(503,'NOT_CONFIGURED','Thiếu secret TOKEN_ENCRYPTION_KEY trong Runtime Production của Worker.');
 try{key=unb64(env.TOKEN_ENCRYPTION_KEY);}catch{fail(503,'NOT_CONFIGURED','TOKEN_ENCRYPTION_KEY không phải khóa base64url hợp lệ. Kiểm tra khóa đã lưu, không tự tạo lại khi đã có kết nối.');}
 if(key.length!==32)fail(503,'NOT_CONFIGURED','TOKEN_ENCRYPTION_KEY phải giải mã thành đúng 32 byte. Kiểm tra khóa đã lưu.');
 if(!env.AUTH_DB)fail(503,'NOT_CONFIGURED','Thiếu binding D1 AUTH_DB trong Production của Worker.');
 return {origin:origin.origin,users,key,sessionDays:Math.min(30,Math.max(1,Number(env.SESSION_DAYS)||14))};
}
async function seal(cfg,value,aad){const iv=bytes(12),key=await crypto.subtle.importKey('raw',cfg.key,'AES-GCM',false,['encrypt']);const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(aad)},key,encoder.encode(JSON.stringify(value)));return 'v1.'+b64url(iv)+'.'+b64url(data);}
async function open(cfg,cipher,aad){try{const [version,iv,data]=cipher.split('.');if(version!=='v1')throw Error();const key=await crypto.subtle.importKey('raw',cfg.key,'AES-GCM',false,['decrypt']);return JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:encoder.encode(aad)},key,unb64(data))));}catch{fail(503,'KEY_ERROR','Chưa giải mã được kết nối. Kiểm tra khóa backend; dữ liệu Kho được giữ.');}}
const aad=(profile,sub)=>'google-connection:'+profile+':'+sub;
function profileOf(url,cfg){const profile=url.searchParams.get('profile')||'';if(!Object.hasOwn(cfg.users,profile))fail(403,'PROFILE_DENIED','Hồ sơ chưa được phép dùng backend này.');return profile;}
function sameOrigin(req,cfg,csrf){if(req.headers.get('Origin')!==cfg.origin)fail(403,'ORIGIN_DENIED','Yêu cầu phải xuất phát từ Siêu Ads thử nghiệm.');if(csrf&&req.headers.get('X-CSRF-Token')!==csrf)fail(403,'CSRF_DENIED','Phiên thao tác đã đổi. Tải lại trang rồi thử lại.');}
async function rate(db,bucket,limit,ttl){const time=now(),row=await db.prepare('INSERT INTO oauth_rate_limits(bucket,hits,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN expires_at<? THEN 1 ELSE hits+1 END, expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING hits').bind(bucket,time+ttl,time,time).first();if(row.hits>limit)fail(429,'RATE_LIMIT','Thao tác quá nhanh. Đợi một chút rồi thử lại.');}
async function boundedJson(req,limit=12000){const text=await boundedBody(req,limit);try{return JSON.parse(decoder.decode(text));}catch{fail(400,'INVALID_JSON','Dữ liệu yêu cầu chưa hợp lệ.');}}
async function boundedBody(response,limit){if(Number(response.headers.get('Content-Length'))>limit)fail(413,'TOO_LARGE','Nguồn vượt giới hạn đọc; Catalog cũ được giữ.');const reader=response.body?.getReader();if(!reader)return new Uint8Array();let total=0;const parts=[];try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit)fail(413,'TOO_LARGE','Nguồn vượt giới hạn đọc; Catalog cũ được giữ.');parts.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}const out=new Uint8Array(total);let pos=0;for(const p of parts){out.set(p,pos);pos+=p.length;}return out;}
async function googleFetch(url,options={}){
 let response;
 // Workers supports manual/follow only. Never follow Google redirects with credentials.
 try{response=await fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(25000)});}catch{fail(502,'GOOGLE_UNREACHABLE','Chưa kết nối được Google. Catalog cũ được giữ; thử lại khi mạng ổn định.');}
 if(response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>{});fail(502,'GOOGLE_REDIRECT','Google trả chuyển hướng chưa được hỗ trợ. Catalog cũ được giữ.');}
 return response;
}
async function providerJson(response){try{return JSON.parse(decoder.decode(await boundedBody(response,64000)));}catch(e){if(e instanceof SafeError)throw e;fail(502,'GOOGLE_RESPONSE','Google chưa trả dữ liệu hợp lệ.');}}
function popup(cfg,profile,ok,message,headers={}){const nonce=b64url(bytes(16)),payload=JSON.stringify({type:'sieuads-oauth-result',profile,ok,message}).replace(/</g,'\\u003c');return new Response(`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Kết nối Siêu Ads</title><body><p id="message"></p><script nonce="${nonce}">const result=${payload};document.getElementById('message').textContent=result.message;if(window.opener){window.opener.postMessage(result,${JSON.stringify(cfg.origin)});if(result.ok)window.close();}</script></body></html>`,{headers:{...common,...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`}});}
async function start(req,env,cfg,url){
 const profile=profileOf(url,cfg);if(req.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'ORIGIN_DENIED','Mở kết nối từ Siêu Ads thử nghiệm.');
 await rate(env.AUTH_DB,'start:'+await digest((req.headers.get('CF-Connecting-IP')||'local')+env.TOKEN_ENCRYPTION_KEY),10,10*60*1000);
 const state=random(),flow=random(),verifier=b64url(bytes(32)),expires=now()+600000;
 await env.AUTH_DB.prepare('DELETE FROM oauth_flows WHERE expires_at<?').bind(now()).run();
 await env.AUTH_DB.prepare('DELETE FROM app_sessions WHERE expires_at<?').bind(now()).run();
 await env.AUTH_DB.prepare('DELETE FROM oauth_rate_limits WHERE expires_at<?').bind(now()).run();
 const stateHash=await digest(state),wantsDrive=url.searchParams.get('excel')==='1';
 await env.AUTH_DB.prepare('INSERT INTO oauth_flows(state_hash,flow_hash,profile,verifier_cipher,expires_at,wants_drive) VALUES(?,?,?,?,?,?)').bind(stateHash,await digest(flow),profile,await seal(cfg,{verifier},'oauth-flow:'+stateHash),expires,Number(wantsDrive)).run();
 const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 Object.entries({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:cfg.origin+'/auth/callback',response_type:'code',scope:'openid email '+SHEETS+(wantsDrive?' '+DRIVE:''),access_type:'offline',include_granted_scopes:'true',prompt:'consent select_account',state,code_challenge:b64url(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))),code_challenge_method:'S256'}).forEach(([k,v])=>target.searchParams.set(k,v));
 return new Response(null,{status:302,headers:{...common,Location:target.href,'Set-Cookie':cookie(cookieName('flow',profile),flow,600,'Lax')}});
}
async function callback(req,env,cfg,url){
 const state=url.searchParams.get('state')||'';if(!/^[a-f0-9]{64}$/.test(state))fail(400,'INVALID_STATE','Phiên cấp quyền không hợp lệ. Mở lại Kết nối Google.');
 const hash=await digest(state),flow=await env.AUTH_DB.prepare('SELECT * FROM oauth_flows WHERE state_hash=?').bind(hash).first();
 if(!flow||flow.expires_at<now()||!Object.hasOwn(cfg.users,flow.profile)||await digest(readCookie(req,cookieName('flow',flow.profile)))!==flow.flow_hash)fail(400,'INVALID_STATE','Phiên cấp quyền hết hạn hoặc không thuộc trình duyệt này.');
 const consumed=await env.AUTH_DB.prepare('DELETE FROM oauth_flows WHERE state_hash=? RETURNING state_hash').bind(hash).first();if(!consumed)fail(400,'USED_STATE','Phiên cấp quyền đã được dùng.');
 const headers=new Headers({'Set-Cookie':cookie(cookieName('flow',flow.profile),'',0,'Lax')});
 if(url.searchParams.has('error'))return popup(cfg,flow.profile,false,'Chưa cấp quyền Google. Catalog cũ được giữ.',Object.fromEntries(headers));
 const code=url.searchParams.get('code');if(!code||code.length>4096)fail(400,'INVALID_CODE','Google chưa trả mã cấp quyền hợp lệ.');
 const {verifier}=await open(cfg,flow.verifier_cipher,'oauth-flow:'+hash);
 const response=await googleFetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,code,code_verifier:verifier,redirect_uri:cfg.origin+'/auth/callback',grant_type:'authorization_code'})});
 const tokens=await providerJson(response);if(!response.ok||!tokens.access_token)return popup(cfg,flow.profile,false,'Google chưa hoàn tất kết nối. Bấm Kết nối Google để thử lại.',Object.fromEntries(headers));
 const identityResponse=await googleFetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token}}),identity=await providerJson(identityResponse);
 if(!identityResponse.ok)return popup(cfg,flow.profile,false,'[GOOGLE_IDENTITY_FAILED] Google chưa trả được thông tin tài khoản (HTTP '+identityResponse.status+'). Thử kết nối lại; quyền hồ sơ chưa được thay đổi.',Object.fromEntries(headers));
 const email=String(identity.email||'').toLowerCase(),sub=String(identity.sub||'');
 if(!email||!sub)return popup(cfg,flow.profile,false,'[GOOGLE_IDENTITY_INCOMPLETE] Google chưa trả đủ email hoặc mã tài khoản. Thử kết nối lại bằng tài khoản Google chính.',Object.fromEntries(headers));
 if(identity.email_verified!==true)return popup(cfg,flow.profile,false,'[GOOGLE_EMAIL_UNVERIFIED] Google chưa xác nhận email của tài khoản này. Kiểm tra tài khoản Google đã chọn.',Object.fromEntries(headers));
 if(!cfg.users[flow.profile].some(x=>x.toLowerCase()===email))return popup(cfg,flow.profile,false,'[PROFILE_EMAIL_DENIED] Email Google '+email+' không được cấp cho hồ sơ '+flow.profile+'. Chọn đúng hồ sơ và tài khoản; quản trị viên kiểm tra ALLOWED_USERS của bản đang dùng.',Object.fromEntries(headers));
 const scopes=new Set(String(tokens.scope||'').split(/\s+/));if(!scopes.has(SHEETS)||(flow.wants_drive&&!scopes.has(DRIVE)))return popup(cfg,flow.profile,false,'Chưa cấp đủ quyền chỉ đọc cho loại nguồn đã chọn.',Object.fromEntries(headers));
 const prior=await env.AUTH_DB.prepare('SELECT * FROM google_connections WHERE profile=? AND google_sub=?').bind(flow.profile,sub).first();
 const previous=prior?await open(cfg,prior.token_cipher,aad(flow.profile,sub)):{};
 const refresh=tokens.refresh_token||previous.refreshToken,ttl=Number(tokens.expires_in);if(!refresh||!Number.isFinite(ttl)||ttl<=60)return popup(cfg,flow.profile,false,'Chưa nhận được quyền gia hạn. Kết nối lại và chấp thuận quyền Google.',Object.fromEntries(headers));
 const cipher=await seal(cfg,{accessToken:tokens.access_token,refreshToken:refresh},aad(flow.profile,sub));
 await env.AUTH_DB.prepare('INSERT INTO google_connections(profile,google_sub,email,token_cipher,expires_at,has_drive) VALUES(?,?,?,?,?,?) ON CONFLICT(profile,google_sub) DO UPDATE SET email=excluded.email,token_cipher=excluded.token_cipher,expires_at=excluded.expires_at,has_drive=excluded.has_drive,version=google_connections.version+1,lease_id=NULL,lease_until=0').bind(flow.profile,sub,email,cipher,now()+ttl*1000,Number(scopes.has(DRIVE))).run();
 // Reconnecting the same profile creates a new session and invalidates older profile sessions.
 await env.AUTH_DB.prepare('DELETE FROM app_sessions WHERE profile=?').bind(flow.profile).run();
 await env.AUTH_DB.prepare('DELETE FROM google_connections WHERE profile=? AND google_sub<>?').bind(flow.profile,sub).run();
 const session=random(),csrf=random(),maxAge=cfg.sessionDays*86400;
 await env.AUTH_DB.prepare('INSERT INTO app_sessions(session_hash,profile,google_sub,csrf,expires_at) VALUES(?,?,?,?,?)').bind(await digest(session),flow.profile,sub,csrf,now()+maxAge*1000).run();
 const result=popup(cfg,flow.profile,true,'Đã kết nối Google. Bạn có thể quay lại Siêu Ads.');
 result.headers.append('Set-Cookie',cookie(cookieName('flow',flow.profile),'',0,'Lax'));
 result.headers.append('Set-Cookie',cookie(cookieName('session',flow.profile),session,maxAge));return result;
}
async function session(req,env,cfg,profile){const raw=readCookie(req,cookieName('session',profile));if(!/^[a-f0-9]{64}$/.test(raw))fail(401,'CONNECT_REQUIRED','Bấm Kết nối Google cho hồ sơ đang chọn.');
 const s=await env.AUTH_DB.prepare('SELECT * FROM app_sessions WHERE session_hash=? AND profile=? AND expires_at>?').bind(await digest(raw),profile,now()).first();if(!s)fail(401,'CONNECT_REQUIRED','Phiên Siêu Ads đã hết hạn. Kết nối Google để tiếp tục.');
 const connection=await env.AUTH_DB.prepare('SELECT * FROM google_connections WHERE profile=? AND google_sub=?').bind(profile,s.google_sub).first();
 if(!connection||!cfg.users[profile]?.some(x=>x.toLowerCase()===connection.email))fail(401,'CONNECT_REQUIRED','Kết nối không còn được cấp quyền cho hồ sơ này.');return {...s,connection};
}
async function invalidate(env,connection){await env.AUTH_DB.batch([env.AUTH_DB.prepare('DELETE FROM app_sessions WHERE profile=? AND google_sub=? AND EXISTS(SELECT 1 FROM google_connections WHERE profile=? AND google_sub=? AND version=?)').bind(connection.profile,connection.google_sub,connection.profile,connection.google_sub,connection.version),env.AUTH_DB.prepare('DELETE FROM google_connections WHERE profile=? AND google_sub=? AND version=?').bind(connection.profile,connection.google_sub,connection.version)]);}
async function access(env,cfg,connection,force=false){
 let current=connection;
 for(let attempt=0;attempt<12;attempt++){
  if((!force||current.version!==connection.version)&&current.expires_at>now()+60000)return (await open(cfg,current.token_cipher,aad(current.profile,current.google_sub))).accessToken;
  const lease=random();
  const locked=await env.AUTH_DB.prepare('UPDATE google_connections SET lease_id=?,lease_until=? WHERE profile=? AND google_sub=? AND version=? AND lease_until<? RETURNING *').bind(lease,now()+30000,current.profile,current.google_sub,current.version,now()).first();
  if(!locked){await new Promise(r=>setTimeout(r,400));current=await env.AUTH_DB.prepare('SELECT * FROM google_connections WHERE profile=? AND google_sub=?').bind(current.profile,current.google_sub).first();if(!current)fail(401,'CONNECT_REQUIRED','Quyền Google đã hết hiệu lực. Kết nối lại để tiếp tục.');continue;}
  try{
   const prior=await open(cfg,locked.token_cipher,aad(locked.profile,locked.google_sub));
   const response=await googleFetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:prior.refreshToken,grant_type:'refresh_token'})}),tokens=await providerJson(response);
   if(!response.ok){if(tokens.error==='invalid_grant'){await invalidate(env,locked);fail(401,'CONNECT_REQUIRED','Google yêu cầu cấp quyền lại. Catalog cũ được giữ.');}fail(502,'REFRESH_FAILED','Chưa gia hạn được Google. Catalog cũ được giữ; thử lại sau.');}
   const ttl=Number(tokens.expires_in);if(!tokens.access_token||!Number.isFinite(ttl)||ttl<=60)fail(502,'REFRESH_FAILED','Google chưa trả thời hạn quyền đọc hợp lệ.');
   const tokenCipher=await seal(cfg,{accessToken:tokens.access_token,refreshToken:tokens.refresh_token||prior.refreshToken},aad(locked.profile,locked.google_sub));
   const saved=await env.AUTH_DB.prepare('UPDATE google_connections SET token_cipher=?,expires_at=?,version=version+1,lease_id=NULL,lease_until=0 WHERE profile=? AND google_sub=? AND lease_id=? RETURNING version').bind(tokenCipher,now()+ttl*1000,locked.profile,locked.google_sub,lease).first();if(!saved)fail(409,'CONNECTION_CHANGED','Kết nối đã đổi trong lúc gia hạn. Thử đồng bộ lại.');
   return tokens.access_token;
  }finally{await env.AUTH_DB.prepare('UPDATE google_connections SET lease_id=NULL,lease_until=0 WHERE profile=? AND google_sub=? AND lease_id=?').bind(locked.profile,locked.google_sub,lease).run();}
 }
 fail(503,'REFRESH_BUSY','Một tác vụ đang gia hạn Google. Đợi một chút rồi thử lại.');
}
function approvedTarget(value,connection){let url;try{url=new URL(value);}catch{fail(400,'BAD_TARGET','Đường dẫn đọc nguồn chưa hợp lệ.');}
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash)fail(400,'BAD_TARGET','Đường dẫn đọc nguồn chưa hợp lệ.');
 let keys;
 if(url.hostname==='sheets.googleapis.com'&&/^\/v4\/spreadsheets\/[\w-]{1,256}(?:\/values\/[^/]+|\/values:batchGet)?$/.test(url.pathname))keys=new Set(['fields','valueRenderOption','majorDimension','ranges']);
 else if(url.hostname==='www.googleapis.com'&&/^\/drive\/v3\/files\/[\w-]{1,256}$/.test(url.pathname)){
  if(!connection.has_drive)fail(403,'DRIVE_SCOPE_REQUIRED','Nguồn Excel cần cấp thêm quyền đọc Drive.');keys=new Set(['fields','supportsAllDrives','alt']);if(url.searchParams.has('alt')&&url.searchParams.get('alt')!=='media')fail(400,'BAD_TARGET','Chỉ cho phép đọc dữ liệu nguồn.');
 }else fail(400,'BAD_TARGET','Backend chỉ đọc nguồn Sheets/Excel được hỗ trợ.');
 if([...url.searchParams.keys()].some(k=>!keys.has(k))||value.length>12000)fail(400,'BAD_TARGET','Tham số đọc nguồn không được hỗ trợ.');return url;
}
async function proxy(req,env,cfg,url){const profile=profileOf(url,cfg),s=await session(req,env,cfg,profile);sameOrigin(req,cfg,s.csrf);await rate(env.AUTH_DB,'read:'+s.session_hash,90,60000);
 const body=await boundedJson(req),target=approvedTarget(body.url,s.connection),source=body.source;
 let resource='';if(source?.resourceKey){if(!/^[\w-]{1,256}$/.test(source.id)||!/^[-\w]{1,512}$/.test(source.resourceKey)||!target.pathname.endsWith('/'+source.id)||target.hostname!=='www.googleapis.com')fail(400,'BAD_RESOURCE_KEY','Resource key chưa hợp lệ.');resource=source.id+'/'+source.resourceKey;}
 let token=await access(env,cfg,s.connection);const send=()=>googleFetch(target.href,{method:'GET',headers:{Authorization:'Bearer '+token,...(resource?{'X-Goog-Drive-Resource-Keys':resource}:{})}});
 let response=await send();if(response.status===401){await response.body?.cancel();const fresh=await env.AUTH_DB.prepare('SELECT * FROM google_connections WHERE profile=? AND google_sub=?').bind(profile,s.google_sub).first();if(!fresh)fail(401,'CONNECT_REQUIRED','Quyền Google đã hết hiệu lực.');token=await access(env,cfg,fresh,true);response=await send();}
 if(!response.ok){await response.body?.cancel();const status=response.status;if(status===401){const current=await env.AUTH_DB.prepare('SELECT * FROM google_connections WHERE profile=? AND google_sub=?').bind(profile,s.google_sub).first();if(current&&(await open(cfg,current.token_cipher,aad(profile,s.google_sub))).accessToken===token)await invalidate(env,current);fail(401,'CONNECT_REQUIRED','Google yêu cầu kết nối lại. Catalog cũ được giữ.');}const messages={400:'Google chưa hỗ trợ loại nguồn hoặc thao tác này.',403:'Google từ chối đọc file. Kiểm tra tài khoản và quyền công ty.',404:'Google không tìm thấy file hoặc tài khoản chưa có quyền đọc.',429:'Google đang giới hạn tần suất. Đợi rồi thử lại.'};fail(status>=500?502:status,'GOOGLE_'+status,(messages[status]||'Google chưa đọc được nguồn.')+' Catalog cũ được giữ.');}
 if(Number(response.headers.get('Content-Length'))>LIMIT){await response.body?.cancel();fail(413,'TOO_LARGE','Nguồn vượt giới hạn 20 MB; Catalog cũ được giữ.');}
 // Stream file bytes; workbook parsing stays in the existing browser worker.
 let size=0;const stream=new TransformStream({transform(chunk,controller){size+=chunk.byteLength;if(size>LIMIT){controller.error(new Error('Nguồn vượt giới hạn 20 MB'));return;}controller.enqueue(chunk);}});
 const contentType=response.headers.get('Content-Type')||'application/octet-stream';
 return new Response(response.body?response.body.pipeThrough(stream):null,{headers:{...common,'Content-Type':contentType}});
}
async function disconnect(req,env,cfg,url){const profile=profileOf(url,cfg),s=await session(req,env,cfg,profile);sameOrigin(req,cfg,s.csrf);const tokens=await open(cfg,s.connection.token_cipher,aad(profile,s.google_sub));
 // Revoking Google consent can affect other grants for this same Google account and OAuth client.
 const response=await googleFetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:tokens.refreshToken})});if(!response.ok&&response.status!==400)fail(502,'REVOKE_FAILED','Chưa ngắt được quyền tại Google. Thử lại sau.');
 const others=await env.AUTH_DB.prepare('SELECT * FROM google_connections WHERE google_sub=?').bind(s.google_sub).all();for(const c of others.results)await invalidate(env,c);
 return json({ok:true},200,{'Set-Cookie':cookie(cookieName('session',profile),'',0)});
}
export default {async fetch(req,env){const url=new URL(req.url);if(!url.pathname.startsWith('/auth/'))return env.ASSETS.fetch(req);
 try{const cfg=config(env);if(url.origin!==cfg.origin)fail(403,'ORIGIN_DENIED','Backend chưa được cấu hình cho địa chỉ này.');
  if(url.pathname==='/auth/config'&&req.method==='GET')return json({enabled:true,clientId:env.GOOGLE_CLIENT_ID,profiles:Object.keys(cfg.users)});
  if(url.pathname==='/auth/start'&&req.method==='GET')return await start(req,env,cfg,url);
  if(url.pathname==='/auth/callback'&&req.method==='GET')return await callback(req,env,cfg,url);
  if(url.pathname==='/auth/session'&&req.method==='GET'){const p=profileOf(url,cfg),s=await session(req,env,cfg,p);return json({connected:true,profile:p,email:s.connection.email,excel:!!s.connection.has_drive,until:s.expires_at,csrf:s.csrf});}
  if(url.pathname==='/auth/read'&&req.method==='POST')return await proxy(req,env,cfg,url);
  if(url.pathname==='/auth/disconnect'&&req.method==='POST')return await disconnect(req,env,cfg,url);
  fail(405,'METHOD_DENIED','Thao tác chưa được hỗ trợ.');
 }catch(error){if(error instanceof SafeError)return json({ok:false,error:error.code,message:error.message},error.status);return json({ok:false,error:'BACKEND_ERROR',message:'Backend chưa xử lý được yêu cầu. Catalog cũ được giữ.'},503);}
}};


