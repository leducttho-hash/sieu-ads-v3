import {readFile,writeFile,copyFile,mkdir,rm,cp} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..'),out=resolve(here,'public');
let html=await readFile(resolve(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
const connector=scripts.find(x=>/\bid=["']google-connector["']/.test(x[1]));
if(!connector)throw Error('Cannot locate the existing Google connector');
let code=connector[2];
function replace(old,value){if(!code.includes(old))throw Error('Connector changed: '+old.slice(0,60));code=code.replace(old,value);}
replace('function abort(){epoch++;','function abort(){window.SieuGoogleBackend?.abort();epoch++;');
replace('function forget(){abort();','function forget(){window.SieuGoogleBackend?.forget();abort();');
replace('function status(profile,clientId){auth=', 'function status(profile,clientId){if(window.SieuGoogleBackend?.enabled)return window.SieuGoogleBackend.status(profile);auth=');
replace('function sdk(){if(window.google', 'function sdk(){if(window.SieuGoogleBackend?.enabled)return window.SieuGoogleBackend.ready;if(window.google');
replace('function connect({profile,clientId,excel=false,resume=false}){', 'function connect({profile,clientId,excel=false,resume=false}){\n if(window.SieuGoogleBackend?.enabled){const ticket=epoch;return window.SieuGoogleBackend.connect({profile,excel}).then(value=>{if(ticket!==epoch)throw aborted();return {...value,epoch:ticket};});}');
replace('async function ensure({profile,clientId,excel=false}){','async function ensure({profile,clientId,excel=false}){if(window.SieuGoogleBackend?.enabled){const ticket=epoch;const value=await window.SieuGoogleBackend.ensure({profile,excel});if(ticket!==epoch)throw aborted();return {...value,epoch:ticket};}');
replace("    const ticket=epoch;if(!publicRead", "    const ticket=epoch;if(!publicRead&&window.SieuGoogleBackend?.enabled){const value=await window.SieuGoogleBackend.request(url,ctx,{binary,source});if(ticket!==epoch)throw aborted();return value;}if(!publicRead");
replace('async function account(ctx){','async function account(ctx){if(window.SieuGoogleBackend?.enabled)return window.SieuGoogleBackend.account(ctx);');
replace('async function disconnect(ctx){','async function disconnect(ctx){if(window.SieuGoogleBackend?.enabled)return window.SieuGoogleBackend.disconnect(ctx);');
replace('  restoreSessions();','  if(!window.SieuGoogleBackend?.enabled)restoreSessions();');
html=html.replace(connector[0],'<script src="/backend-client.js"></script>\n<script '+connector[1]+'>'+code+'</script>');
if(!html.includes('(async()=>{await initDisk();'))throw Error('Application startup changed');
html=html.replace('(async()=>{await initDisk();','(async()=>{await window.SieuGoogleBackend.ready;await initDisk();if(window.SieuGoogleBackend.clientId)db.oauthClientId=window.SieuGoogleBackend.clientId;');
html=html.replace(' const cfg=db.warehouseSheetSync[sk];',' const cfg=db.warehouseSheetSync[sk];if(window.SieuGoogleBackend.clientId)cfg.oauthClientId=window.SieuGoogleBackend.clientId;');
html=html.replace('id="sync-oauth-client-id"','id="sync-oauth-client-id" readonly title="Client ID được quản lý trên backend thử nghiệm"');
html=html.replace('Đã kết nối · giữ phiên khi đổi Kho và tải lại tab.','Đã kết nối · tự gia hạn qua backend.');
html=html.replace('Giữ kết nối trong tab này; không đưa token vào Backup.','Quyền gia hạn được mã hóa trên backend; không đưa token vào HTML hoặc Backup.');
// Isolated CRM input adapter: root index and all existing report rules stay untouched.
const crmAddon=await readFile(resolve(here,'crm-api-panel.js'),'utf8');
function crmReplace(old,value){if(html.split(old).length!==2)throw Error('CRM hook changed or ambiguous: '+old.slice(0,80));html=html.replace(old,value);}
const reportStart=html.indexOf('function reportView(){');
const crmCardStart=html.indexOf("${card('2. Nguồn CRM',",reportStart);
const crmCardEnd=html.indexOf("${card('3. Link bài viết',",crmCardStart);
if(reportStart<0||crmCardStart<0||crmCardEnd<0)throw Error('CRM source card not found');
html=html.slice(0,crmCardStart)+'${crmApiSourceCard(d)}'+html.slice(crmCardEnd);
crmReplace('<div class="report-inputs">','<div id="crm-api-report-inputs" class="report-inputs crm-api-report-inputs">');
crmReplace("a=C.parseDelimitedMatrix(r.crmPaste,'\\t');if(!a.length)return[];", "a=C.parseDelimitedMatrix(crmApiInputText(r),'\\t');if(!a.length)return[];");
crmReplace('function switchScope(type,value){sheetScopeEpoch++;', 'function switchScope(type,value){crmApiInvalidate();sheetScopeEpoch++;');
crmReplace("document.addEventListener('click',e=>{if(!e.target.closest('details.inline-menu'))", crmAddon+"\ndocument.addEventListener('click',e=>{if(!e.target.closest('details.inline-menu'))");
crmReplace('</head>','<link rel="stylesheet" href="/crm-api-panel.css?v=personnel-v2"></head>');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
await writeFile(resolve(out,'index.html'),html);
await copyFile(resolve(here,'backend-client.js'),resolve(out,'backend-client.js'));
await copyFile(resolve(here,'crm-api-panel.css'),resolve(out,'crm-api-panel.css'));
for(const asset of ['excel-preview-worker.js','vendor-exceljs-4.4.0.min.js','EXCELJS-LICENSE.txt'])await copyFile(resolve(root,asset),resolve(out,asset));
await cp(resolve(here,'pages'),out,{recursive:true});
console.log('Prepared isolated OAuth pilot; original index.html unchanged.');

