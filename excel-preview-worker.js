/* Siêu Ads OAuth pilot. Workbook bytes only; this worker never receives OAuth tokens. */
'use strict';
importScripts('./vendor-exceljs-4.4.0.min.js');
const MAX_BYTES=20*1024*1024;
function checkArchive(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>MAX_BYTES||buffer.byteLength<22)throw Error('INVALID_FILE');
  const view=new DataView(buffer);let end=-1;
  for(let p=buffer.byteLength-22;p>=Math.max(0,buffer.byteLength-65557);p--){if(view.getUint32(p,true)===0x06054b50&&p+22+view.getUint16(p+20,true)===buffer.byteLength){end=p;break;}}
  if(end<0)throw Error('INVALID_FILE');
  const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true),directorySize=view.getUint32(end+12,true);
  if(count>10000||view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0||offset+directorySize>end)throw Error('LIMIT');
  let p=offset,total=0;
  for(let i=0;i<count;i++){
    if(p+46>end||view.getUint32(p,true)!==0x02014b50)throw Error('INVALID_FILE');
    if(view.getUint16(p+8,true)&1)throw Error('ENCRYPTED');
    total+=view.getUint32(p+24,true);if(total>128*1024*1024)throw Error('LIMIT');
    p+=46+view.getUint16(p+28,true)+view.getUint16(p+30,true)+view.getUint16(p+32,true);
    if(p>offset+directorySize)throw Error('INVALID_FILE');
  }
}
function plain(value,stats,depth=0,address=''){
  if(value===null||value===undefined)return '';
  if(depth>4)return '';
  if(value instanceof Date)return Number.isFinite(value.getTime())?new Intl.DateTimeFormat('vi-VN',{timeZone:'UTC'}).format(value):'';
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value);
  if(typeof value==='object'){
    if('formula' in value||'sharedFormula' in value){if(value.result===undefined||value.result===null){stats.missingFormula++;stats.missingFormulaCells.push({address,formula:String(value.formula??'').slice(0,500),sharedFormula:String(value.sharedFormula??'')});return '[Chưa đọc được kết quả công thức]';}return plain(value.result,stats,depth+1,address);}
    if(Array.isArray(value.richText))return value.richText.map(p=>p.text??'').join('');
    if('text' in value)return String(value.text??'');
    if('error' in value){stats.cellErrors++;stats.errorCells.push({address,error:String(value.error)});return String(value.error);}
  }
  return '';
}
self.onmessage=async event=>{
  try{
    const {buffer,tabName}=event.data;
    checkArchive(buffer);
    if(typeof tabName!=='string'||!tabName.trim())throw Error('TAB_REQUIRED');
    const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);
    const sheet=book.worksheets.find(s=>s.name===tabName.trim());
    if(!sheet){self.postMessage({ok:false,code:'TAB_NOT_FOUND',sheetNames:book.worksheets.map(s=>s.name)});return;}
    const stats={missingFormula:0,cellErrors:0,missingFormulaCells:[],errorCells:[]},values=[];
    const last=Math.min(20,sheet.actualRowCount?sheet.rowCount:0);
    for(let row=1;row<=last;row++){
      const line=[];for(let col=1;col<=20;col++){const cell=sheet.getCell(row,col);let value=cell.value;if(value&&typeof value==='object'&&('formula' in value||'sharedFormula' in value))value={...value,result:cell.result};line.push(plain(value,stats,0,cell.address));}
      values.push(line);
    }
    self.postMessage({ok:true,tabName:sheet.name,values,stats});
  }catch(error){const known=['INVALID_FILE','LIMIT','ENCRYPTED','TAB_REQUIRED'];self.postMessage({ok:false,code:known.includes(error.message)?error.message:'PARSE_FAILED'});}
};
