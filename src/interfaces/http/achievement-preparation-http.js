import {readFile} from 'node:fs/promises';
export function createAchievementPreparationHandler({service,sendJson,sendText}={}){
 return async(req,res,url)=>{
  const assets=new Map([['/achievement-preparation.js',['./achievement-preparation.js','text/javascript; charset=utf-8']],['/achievement-preparation.css',['./achievement-preparation.css','text/css; charset=utf-8']]]);
  if(req.method==='GET'&&assets.has(url.pathname)){const [file,type]=assets.get(url.pathname);sendText(res,200,await readFile(new URL(file,import.meta.url),'utf8'),{'content-type':type,'cache-control':'no-store'});return true;}
  if(!['/api/preparation/options','/api/preparation/achievements'].includes(url.pathname))return false;
  res.setHeader?.('cache-control','no-store');res.setHeader?.('x-content-type-options','nosniff');
  const origin=req.headers.origin,host=req.headers.host;
  if((origin&&origin!==`http://${host}`&&origin!==`https://${host}`)||req.headers['sec-fetch-site']==='cross-site'){sendJson(res,403,{ok:false,error:'Cross-origin evidence access is not allowed.'});return true;}
  if(!service){sendJson(res,503,{ok:false,error:'Evidence preparation is unavailable in this server configuration.'});return true;}
  try{
   if(req.method==='GET'&&url.pathname==='/api/preparation/options'){sendJson(res,200,{ok:true,roles:await service.roles()});return true;}
   if(req.method!=='POST'||url.pathname!=='/api/preparation/achievements')throw Object.assign(new Error('Method not allowed.'),{statusCode:405});
   if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw Object.assign(new Error('JSON content type required.'),{statusCode:415});
   const chunks=[];let size=0;for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>128*1024)throw Object.assign(new Error('Evidence request is too large.'),{statusCode:413});chunks.push(bytes);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('Valid JSON required.'),{statusCode:400});}
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['roleCode','jobDescriptionText'].includes(k)))throw Object.assign(new Error('Unsupported evidence request fields.'),{statusCode:400});
   sendJson(res,200,{ok:true,catalogue:await service.load(body)});
  }catch(e){sendJson(res,e.statusCode||503,{ok:false,error:e.statusCode?e.message:'CV evidence is unavailable. No provider request was made.'});}
  return true;
 };
}
