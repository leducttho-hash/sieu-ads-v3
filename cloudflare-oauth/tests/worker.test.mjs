import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../worker.mjs';
const ORIGIN='https://sieuads-pilot.example',S='https://www.googleapis.com/auth/spreadsheets.readonly',D='https://www.googleapis.com/auth/drive.readonly';
const database=new DatabaseSync(':memory:');database.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
const prepare=sql=>({bind(...values){return query(sql,values)},...query(sql,[])});
function query(sql,values){return{bind(...next){return query(sql,next)},async first(){return database.prepare(sql).get(...values)||null},async run(){return database.prepare(sql).run(...values)},async all(){return{results:database.prepare(sql).all(...values)}}};}
const env={APP_ORIGIN:ORIGIN,GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'FIXTURE_CLIENT_SECRET',TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,11).toString('base64url'),ALLOWED_USERS:JSON.stringify({ThoLD:['tho@example.invalid'],Mynnh:['my@example.invalid'],Huyenbtt:['huyen@example.invalid']}),AUTH_DB:{prepare,async batch(items){return Promise.all(items.map(x=>x.run()))}},ASSETS:{fetch:async()=>new Response('Stable app')}};
const calls=[];let refreshError=false,resourceStatus=200,networkError=false,oversized=false,refreshDelay=0,scopeOverride=null,refreshCounter=0,redirectEndpoint='',identityStatus=200,identityOverride=null;
const identities={tho:{email:'tho@example.invalid',sub:'sub-tho'},my:{email:'My@Example.Invalid',sub:'sub-my'},huyen:{email:'huyen@example.invalid',sub:'sub-huyen'},outsider:{email:'outsider@example.invalid',sub:'sub-other'}};
globalThis.fetch=async(url,options={})=>{
 calls.push({url:String(url),options});
 // Workers throws before sending requests with the unsupported redirect:error mode.
 if(options.redirect==='error')throw new TypeError('Unsupported redirect mode: error');
 assert.equal(options.redirect,'manual');if(networkError)throw Error('FIXTURE_NETWORK');
 if(String(url)===redirectEndpoint)return new Response('FIXTURE_PROVIDER_SECRET',{status:302,headers:{Location:'https://untrusted.example/collect?token=FIXTURE_PROVIDER_SECRET'}});
 if(String(url)==='https://oauth2.googleapis.com/token'){
  const body=new URLSearchParams(options.body);assert.equal(body.get('client_secret'),'FIXTURE_CLIENT_SECRET');
  if(body.get('grant_type')==='authorization_code'){const who=body.get('code');assert(body.get('code_verifier'));assert.equal(body.get('redirect_uri'),ORIGIN+'/auth/callback');return Response.json({access_token:'FIXTURE_ACCESS_'+who,refresh_token:'FIXTURE_REFRESH_'+who,expires_in:3600,scope:scopeOverride||'openid email '+S+' '+D});}
  refreshCounter++;if(refreshDelay)await new Promise(r=>setTimeout(r,refreshDelay));if(refreshError)return Response.json({error:'invalid_grant'},{status:400});return Response.json({access_token:'FIXTURE_FRESH_'+refreshCounter,refresh_token:'FIXTURE_ROTATED_'+refreshCounter,expires_in:3600});
 }
 if(String(url)==='https://openidconnect.googleapis.com/v1/userinfo'){const who=options.headers.Authorization.replace('Bearer FIXTURE_ACCESS_','');return Response.json(identityOverride||{...identities[who],email_verified:true},{status:identityStatus});}
 if(String(url)==='https://oauth2.googleapis.com/revoke')return new Response(null,{status:200});
 assert(/^https:\/\/(sheets.googleapis.com|www.googleapis.com)\//.test(String(url)),'no arbitrary outbound target');assert(options.headers.Authorization.startsWith('Bearer FIXTURE_'));assert.equal(options.method,'GET');
 if(oversized)return new Response('oversized',{headers:{'Content-Length':String(21*1024*1024)}});
 if(resourceStatus!==200)return Response.json({error:'provider-fixture'},{status:resourceStatus});
 if(String(url).includes('alt=media'))return new Response(new Uint8Array([80,75,3,4]),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
 return Response.json({fixture:true,values:[['Mã','Caption'],['CODE','Body']]});
};
const headers=(jar={},extra={})=>({Cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; '),...extra});
function updateJar(jar,res){for(const c of res.headers.getSetCookie()){const [pair]=c.split(';'),at=pair.indexOf('=');jar[pair.slice(0,at)]=pair.slice(at+1);}}
async function dispatch(path,{jar={},method='GET',body,extra={}}={}){return worker.fetch(new Request(ORIGIN+path,{method,headers:headers(jar,{...(body?{'Content-Type':'application/json'}:{}),...extra}),body:body?JSON.stringify(body):undefined}),env);}
async function begin(profile,jar={}){const res=await dispatch('/auth/start?profile='+profile+'&excel=1',{jar,extra:{'Sec-Fetch-Site':'same-origin'}});assert.equal(res.status,302);updateJar(jar,res);const url=new URL(res.headers.get('Location'));assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256');return{state:url.searchParams.get('state'),jar};}
async function login(profile,who){const f=await begin(profile);const res=await dispatch('/auth/callback?state='+f.state+'&code='+who,{jar:f.jar});assert.equal(res.status,200);updateJar(f.jar,res);return{...f,res};}
async function getSession(profile,jar){const res=await dispatch('/auth/session?profile='+profile,{jar});assert.equal(res.status,200);return res.json();}
async function read(profile,jar,csrf,url='https://sheets.googleapis.com/v4/spreadsheets/fixture/values/A1%3AE20?valueRenderOption=FORMATTED_VALUE',extra={}){return dispatch('/auth/read?profile='+profile,{jar,method:'POST',body:{url},extra:{Origin:ORIGIN,'X-CSRF-Token':csrf,...extra}});}
const noConfig=await worker.fetch(new Request(ORIGIN+'/auth/config'),{...env,GOOGLE_CLIENT_SECRET:''});assert.equal(noConfig.status,503);assert(!(await noConfig.text()).includes('FIXTURE_'));
const badConfigCases=[
 ['APP_ORIGIN',''],['APP_ORIGIN',ORIGIN+'/'],
 ['ALLOWED_USERS',''],['ALLOWED_USERS','{BROKEN_FIXTURE'],['ALLOWED_USERS','[]'],['ALLOWED_USERS','{}'],['ALLOWED_USERS',JSON.stringify({ThoLD:'FIXTURE_PRIVATE_EMAIL'})],
 ['GOOGLE_CLIENT_ID','FIXTURE_PRIVATE_CLIENT_ID'],['GOOGLE_CLIENT_SECRET',''],
 ['TOKEN_ENCRYPTION_KEY',''],['TOKEN_ENCRYPTION_KEY','%%%FIXTURE_PRIVATE_KEY'],['TOKEN_ENCRYPTION_KEY',Buffer.alloc(31).toString('base64url')],['AUTH_DB',undefined]
];
for(const [name,value] of badConfigCases){
 const response=await worker.fetch(new Request(ORIGIN+'/auth/config'),{...env,[name]:value});
 assert.equal(response.status,503);const payload=await response.json();assert.equal(payload.error,'NOT_CONFIGURED');assert(payload.message.includes(name),'name the invalid config entry');
 assert(!JSON.stringify(payload).includes('FIXTURE_')&&!JSON.stringify(payload).includes('example.invalid'),'configuration errors must not disclose secret values or private emails');
}
console.log('PASS configuration diagnostics identify missing/invalid entries without exposing values');
assert.equal((await worker.fetch(new Request(ORIGIN+'/'),env)).status,200);
assert.equal((await dispatch('/auth/start?profile=unknown')).status,403);
assert.equal((await dispatch('/auth/start?profile=ThoLD',{extra:{'Sec-Fetch-Site':'cross-site'}})).status,403);
const invalidFlow=await begin('ThoLD');assert.equal((await dispatch('/auth/callback?state='+invalidFlow.state+'&code=tho')).status,400,'callback needs the matching browser cookie');
const bad=await login('ThoLD','outsider');assert((await bad.res.text()).includes('không được cấp'));assert.equal(database.prepare('SELECT COUNT(*) AS n FROM app_sessions').get().n,0);
const denied=await begin('ThoLD');const deniedResponse=await dispatch('/auth/callback?state='+denied.state+'&error=access_denied',{jar:denied.jar});assert((await deniedResponse.text()).includes('Chưa cấp quyền'));
// Distinct callback diagnostics must preserve the same fail-closed authorization.
for(const [status,identity,code] of [
 [403,{error:'FIXTURE_PROVIDER_PRIVATE'},'GOOGLE_IDENTITY_FAILED'],
 [503,{error:'FIXTURE_PROVIDER_PRIVATE'},'GOOGLE_IDENTITY_FAILED'],
 [200,{email:'alias@example.invalid',email_verified:true},'GOOGLE_IDENTITY_INCOMPLETE'],
 [200,{sub:'fixture-sub',email_verified:true},'GOOGLE_IDENTITY_INCOMPLETE'],
 [200,{email:'my@example.invalid',sub:'fixture-sub',email_verified:false},'GOOGLE_EMAIL_UNVERIFIED'],
 [200,{email:'alias@example.invalid',sub:'fixture-sub',email_verified:true},'PROFILE_EMAIL_DENIED']
]){
 database.exec('DELETE FROM oauth_rate_limits');identityStatus=status;identityOverride=identity;
 const attempt=await login('Mynnh','my'),body=await attempt.res.text();
 assert(body.includes('['+code+']'),code);
 assert(!/FIXTURE_PROVIDER_PRIVATE|FIXTURE_ACCESS|FIXTURE_REFRESH|FIXTURE_CLIENT_SECRET|fixture-sub|tho@example.invalid|huyen@example.invalid/.test(body),'never disclose provider bodies, tokens, account IDs or other allowlisted emails');
 if(code==='PROFILE_EMAIL_DENIED'){assert(body.includes('alias@example.invalid'));assert(body.includes('Mynnh'));}
 else assert(!body.includes('@example.invalid'),'do not disclose unverified identity fields');
 assert.equal(database.prepare('SELECT COUNT(*) AS n FROM app_sessions').get().n,0,'failed identity never creates a session');
 assert.equal(database.prepare('SELECT COUNT(*) AS n FROM google_connections').get().n,0,'failed identity never stores a grant');
 assert.equal((await dispatch('/auth/callback?state='+attempt.state+'&code=my',{jar:attempt.jar})).status,400,'diagnostic failures still consume state');
}
identityStatus=200;identityOverride=null;database.exec('DELETE FROM oauth_rate_limits');
console.log('PASS callback separates provider failure, incomplete identity, unverified email and profile email denial without widening access or leaking credentials');
const first=await login('ThoLD','tho'),my=await login('Mynnh','my'),hu=await login('Huyenbtt','huyen');
const firstBody=await first.res.text();assert(!/FIXTURE_ACCESS|FIXTURE_REFRESH|FIXTURE_CLIENT_SECRET/.test(firstBody));assert(first.res.headers.getSetCookie().some(x=>x.includes('HttpOnly')&&x.includes('Secure')&&x.includes('SameSite=Strict')));
assert.equal((await dispatch('/auth/callback?state='+first.state+'&code=tho',{jar:first.jar})).status,400,'state consumed atomically');
const as=await getSession('ThoLD',first.jar),ms=await getSession('Mynnh',my.jar);assert.equal(as.email,'tho@example.invalid');assert.equal(ms.email,'my@example.invalid');
assert.equal((await dispatch('/auth/session?profile=Mynnh',{jar:first.jar})).status,401);assert.equal((await dispatch('/auth/session?profile=ThoLD',{jar:{'__Host-sieuads_session_ThoLD':'a'.repeat(64)}})).status,401);
const stored=database.prepare('SELECT * FROM google_connections').all();assert(!JSON.stringify(stored).includes('FIXTURE_'),'OAuth credentials encrypted at rest');for(const raw of Object.values(first.jar).filter(Boolean))assert(!JSON.stringify(database.prepare('SELECT * FROM app_sessions').all()).includes(raw),'session cookie is hashed at rest');
console.log('PASS fail-closed configuration, OAuth state + PKCE, verified account allowlist, one-use callback, HttpOnly sessions, three isolated profiles and encrypted OAuth tokens');
const initialRefreshes=refreshCounter;let res=await read('ThoLD',first.jar,as.csrf);assert.equal(res.status,200);assert.equal((await res.json()).fixture,true);assert.equal(refreshCounter,initialRefreshes,'reuse valid access token');
assert.equal((await read('ThoLD',first.jar,'WRONG')).status,403);assert.equal((await read('ThoLD',first.jar,as.csrf,undefined,{Origin:'https://attacker.example'})).status,403);
for(const url of ['http://sheets.googleapis.com/v4/spreadsheets/fixture','https://attacker.example/private','https://www.googleapis.com/drive/v3/files','https://www.googleapis.com/drive/v3/files/fixture/permissions','https://sheets.googleapis.com/v4/spreadsheets/fixture?key=arbitrary','https://www.googleapis.com/drive/v3/files/fixture?alt=json','https://sheets.googleapis.com:444/v4/spreadsheets/fixture'])assert.equal((await read('ThoLD',first.jar,as.csrf,url)).status,400);
assert.equal((await dispatch('/auth/read?profile=ThoLD',{jar:first.jar})).status,405);
console.log('PASS same-origin + CSRF enforcement; no arbitrary URL proxy, non-GET Google operation, Drive mutation or extra query parameter');
database.prepare('UPDATE google_connections SET expires_at=? WHERE profile=?').run(Date.now()-1,'ThoLD');
res=await read('ThoLD',first.jar,as.csrf);assert.equal(res.status,200);await res.text();assert.equal(refreshCounter,initialRefreshes+1);
res=await read('ThoLD',first.jar,as.csrf,'https://www.googleapis.com/drive/v3/files/fixture?alt=media&supportsAllDrives=true');assert.deepEqual([...new Uint8Array(await res.arrayBuffer())],[80,75,3,4]);assert.equal(refreshCounter,initialRefreshes+1,'subsequent file read reuses renewed token');
database.prepare('UPDATE google_connections SET expires_at=? WHERE profile=?').run(Date.now()-1,'ThoLD');refreshDelay=25;const n=refreshCounter;const concurrent=await Promise.all([read('ThoLD',first.jar,as.csrf),read('ThoLD',first.jar,as.csrf)]);for(const r of concurrent){assert.equal(r.status,200);await r.text();}assert.equal(refreshCounter,n+1,'atomic lease coalesces concurrent refreshes');refreshDelay=0;
console.log('PASS expired access token renews transparently; rotated refresh stored encrypted; Excel streamed unchanged; concurrent refresh coalesced');
// A late failure from an old refresh must not erase a newly reconnected grant.
database.prepare('UPDATE google_connections SET expires_at=? WHERE profile=?').run(Date.now()-1,'ThoLD');refreshError=true;refreshDelay=30;
const lateFailure=read('ThoLD',first.jar,as.csrf);await new Promise(r=>setTimeout(r,5));
database.prepare('UPDATE google_connections SET version=version+1,expires_at=?,lease_id=NULL,lease_until=0 WHERE profile=?').run(Date.now()+3600000,'ThoLD');
assert.equal((await lateFailure).status,401);refreshError=false;refreshDelay=0;assert.equal((await getSession('ThoLD',first.jar)).connected,true,'newer grant survives an old refresh failure');
console.log('PASS an old in-flight refresh failure cannot erase a newer connection');
resourceStatus=403;const n403=refreshCounter;res=await read('ThoLD',first.jar,as.csrf);assert.equal(res.status,403);assert.equal(refreshCounter,n403,'403 does not trigger token refresh or retry');resourceStatus=200;
networkError=true;res=await read('ThoLD',first.jar,as.csrf);assert.equal(res.status,502);assert.equal((await res.json()).error,'GOOGLE_UNREACHABLE');networkError=false;
for(const endpoint of ['https://oauth2.googleapis.com/token','https://openidconnect.googleapis.com/v1/userinfo']){
 redirectEndpoint=endpoint;const flow=await begin('ThoLD'),before=calls.length;
 res=await dispatch('/auth/callback?state='+flow.state+'&code=tho',{jar:flow.jar});
 assert.equal(res.status,502);const payload=await res.text();assert.equal(JSON.parse(payload).error,'GOOGLE_REDIRECT');assert(!payload.includes('FIXTURE_')&&!payload.includes('untrusted.example'));
 assert.equal(calls.slice(before).filter(c=>c.url===endpoint).length,1,'provider redirect is not retried or followed');
}
redirectEndpoint='';
for(const status of [301,302,303,307,308]){
 resourceStatus=status;const before=calls.length;
 res=await read('ThoLD',first.jar,as.csrf);assert.equal(res.status,502);assert.equal((await res.json()).error,'GOOGLE_REDIRECT');assert.equal(calls.length,before+1);
}
resourceStatus=200;assert.equal((await getSession('ThoLD',first.jar)).connected,true,'redirect failures preserve the existing connection');
console.log('PASS Workers-compatible fetch; token/userinfo/resource redirects rejected without following, retrying, leaking provider data or losing the session');
oversized=true;res=await read('ThoLD',first.jar,as.csrf);assert.equal(res.status,413);oversized=false;
assert.equal((await getSession('Mynnh',my.jar)).connected,true);
database.prepare('UPDATE google_connections SET expires_at=? WHERE profile=?').run(Date.now()-1,'ThoLD');refreshError=true;res=await read('ThoLD',first.jar,as.csrf);assert.equal(res.status,401);refreshError=false;assert.equal((await dispatch('/auth/session?profile=ThoLD',{jar:first.jar})).status,401);assert.equal((await getSession('Mynnh',my.jar)).connected,true);
res=await dispatch('/auth/disconnect?profile=Mynnh',{jar:my.jar,method:'POST',body:{},extra:{Origin:ORIGIN,'X-CSRF-Token':ms.csrf}});assert.equal(res.status,200);assert.equal((await dispatch('/auth/session?profile=Mynnh',{jar:my.jar})).status,401);assert.equal((await getSession('Huyenbtt',hu.jar)).connected,true);
console.log('PASS no refresh on forbidden file; network/oversize errors; revoked grant invalidates only affected account; explicit disconnect leaves other accounts working');
assert(!calls.some(x=>!/^https:\/\/(accounts.google.com|oauth2.googleapis.com|openidconnect.googleapis.com|sheets.googleapis.com|www.googleapis.com)\//.test(x.url)));
console.log('ALL BACKEND TESTS PASS (mock Google endpoints; in-memory SQLite; no real credentials or source files accessed)');


