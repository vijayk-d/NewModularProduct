import {createCvDocumentAdapter} from '../documents/cv-document-adapter.js';
import {realpath,open,stat} from 'node:fs/promises';
import path from 'node:path';
import {exportApplicationPack} from '../../application/export-application-pack.js';
const limit=20*1024*1024;
const blocked=message=>Object.assign(new Error(message),{statusCode:400,code:'APPLICATION_EXPORT_CV'});
export function createExportCvReader(cvFolder){return async relative=>{
 if(typeof cvFolder!=='string'||!cvFolder.trim())throw blocked('CV_FOLDER is not configured.');
 if(path.extname(String(relative)).toLowerCase()==='.docx'){const r=await createCvDocumentAdapter({cvFolder}).read(relative,{includeBytes:true});return Buffer.from(r.data,'base64');}
 if(typeof relative!=='string'||!relative||/[\x00-\x1f:]/.test(relative)||path.win32.isAbsolute(relative)||path.posix.isAbsolute(relative)||relative.replaceAll('\\','/').split('/').some(p=>p==='..')||path.extname(relative).toLowerCase()!=='.pdf')throw blocked('Selected CV must be a relative PDF inside CV_FOLDER.');
 let fd;try{
  const root=await realpath(path.resolve(cvFolder)),file=await realpath(path.resolve(root,relative.replaceAll('\\','/'))),within=path.relative(root,file);
  if(!within||within==='..'||within.startsWith('..'+path.sep)||path.isAbsolute(within))throw blocked('Selected CV is outside CV_FOLDER.');
  const before=await stat(file);if(!before.isFile()||before.size>limit)throw blocked('CV is not a regular file or exceeds 20 MiB.');fd=await open(file,'r');const info=await fd.stat();
  if(!info.isFile()||info.size>limit||info.ino!==before.ino||info.dev!==before.dev)throw blocked('CV changed, is not a regular file, or exceeds 20 MiB.');
  const buffer=Buffer.alloc(limit+1);let length=0;
  while(length<buffer.length){const {bytesRead}=await fd.read(buffer,length,buffer.length-length,length);if(!bytesRead)break;length+=bytesRead;}
  const after=await fd.stat();if(length>limit||after.size!==info.size||after.mtimeMs!==info.mtimeMs||await realpath(file)!==file)throw blocked('CV changed during export or exceeds 20 MiB.');
  const bytes=Buffer.from(buffer.subarray(0,length));if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw blocked('Selected file does not have a PDF header.');return bytes;
 }catch(e){if(e.code==='APPLICATION_EXPORT_CV')throw e;throw blocked('Selected CV could not be read safely. Check the saved selection and CV_FOLDER.');}finally{await fd?.close();}
};}
const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=b=>{let c=0xffffffff;for(const x of b)c=table[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
export function zipStored(files){
 if(!Array.isArray(files)||files.length>8)throw new Error('Invalid export file list.');
 let offset=0,total=0;const local=[],central=[],seen=new Set();
 for(const file of files){if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(file.name)||seen.has(file.name)||!Buffer.isBuffer(file.bytes))throw new Error('Unsafe export filename or data.');seen.add(file.name);total+=file.bytes.length;if(total>24*1024*1024)throw new Error('Export exceeds 24 MiB.');
  const name=Buffer.from(file.name),size=file.bytes.length,sum=crc(file.bytes),h=Buffer.alloc(30),c=Buffer.alloc(46);
  h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(33,12);h.writeUInt32LE(sum,14);h.writeUInt32LE(size,18);h.writeUInt32LE(size,22);h.writeUInt16LE(name.length,26);local.push(h,name,file.bytes);
  c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(33,14);c.writeUInt32LE(sum,16);c.writeUInt32LE(size,20);c.writeUInt32LE(size,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=h.length+name.length+size;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
export function createApplicationPackExporter({cvFolder,documents=null,cvInventory=null,candidateName='Candidate',recordExport=null,tailoredCv=null,wordPathFor=null}={}){
 const readCv=createExportCvReader(cvFolder);let busy=false;
 const cvLibrary=cvInventory?async()=>{const data=await cvInventory.load();return data?.cv_inventory?.cvs||data?.cvs||[];}:null;
 // asFiles: the same checked files as the ZIP, unzipped, for Save pack to folder.
 return async({store,request,asFiles=false})=>{if(busy)throw Object.assign(new Error('Another pack is exporting. Wait, then retry.'),{statusCode:409,code:'APPLICATION_EXPORT_BUSY'});busy=true;try{const result=await exportApplicationPack({store,request,readCv,pack:asFiles?files=>{zipStored(files);return files;}:zipStored,documents,cvLibrary,candidateName,tailoredCv,wordPathFor,word:text=>createCvDocumentAdapter({cvFolder}).word(text)});
  // Recorded only after a complete pack, for advert status. A recording failure never blocks the download.
  if(typeof recordExport==='function'){try{recordExport(request.reviewId,store.get(request.reviewId)?.formData?.jobAdvertLink||'');}catch{console.warn('[EXPORT] PORTAL_EXPORT_NOT_RECORDED');}}
  return asFiles?{stem:result.stem,files:result.bytes}:result;}finally{busy=false;}};
}
