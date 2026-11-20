import {readFile} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {createCvLibrary} from '../../infrastructure/cv-inventory/cv-library-v1.js';
const assets=new Map([['/cv-library',['cv-library-v1.html','text/html; charset=utf-8']],['/cv-library-v1.js',['cv-library-v1.browser.js','text/javascript; charset=utf-8']]]);
export function installCvLibrary(server,options){
 if(!['development','production'].includes(options.mode)||(options.mode==='production'&&!options.sharedDirectory))throw Error('CV library management is development-only unless explicitly configured for shared production storage.');
 const library=createCvLibrary(options),token=randomBytes(32).toString('hex'),previous=server.listeners('request');
 if(!previous.length)throw Error('CV library requires the existing application handler.');
 server.removeAllListeners('request');
 const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
 server.on('request',async(req,res)=>{
  let url;try{url=new URL(req.url,'http://localhost');}catch{json(res,400,{error:'Invalid URL.'});return;}
  const owned=assets.has(url.pathname)||url.pathname==='/api/cv-library'||url.pathname.startsWith('/api/cv-library/');
  if(!owned){for(const fn of previous)fn.call(server,req,res);return;}
  try{
   const address=server.address(),host=String(req.headers.host||''),origin='http://'+host;
   if(!address||!['127.0.0.1','::1'].includes(address.address)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||!['localhost:'+address.port,'127.0.0.1:'+address.port,'[::1]:'+address.port].includes(host)||(req.headers.origin&&req.headers.origin!==origin)||req.headers['sec-fetch-site']==='cross-site'){json(res,403,{error:'Local same-origin access required.'});return;}
   if(assets.has(url.pathname)){if(req.method!=='GET'){json(res,405,{error:'GET required.'});return;}const [file,type]=assets.get(url.pathname);res.writeHead(200,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});res.end(await readFile(new URL(file,import.meta.url)));return;}
   if(req.method==='GET'){
    if(url.pathname==='/api/cv-library/session'){json(res,200,{token});return;}
    if(url.pathname==='/api/cv-library/export'){res.writeHead(200,{'content-type':'application/json; charset=utf-8','content-disposition':'attachment; filename="cv-library.json"','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(await library.exportCatalogue(),null,2)+'\n');return;}
    const actions={'/api/cv-library':()=>library.snapshot(),'/api/cv-library/validate':()=>library.validate(),'/api/cv-library/discover':()=>library.discover(),'/api/cv-library/inspect':()=>library.inspect(url.searchParams.get('code'))};
    if(!actions[url.pathname]){json(res,404,{error:'Unknown library endpoint.'});return;}json(res,200,await actions[url.pathname]());return;
   }
   if(req.method!=='POST'){json(res,405,{error:'GET or POST required.'});return;}
   const supplied=Buffer.from(String(req.headers['x-cv-library-token']||'')),expected=Buffer.from(token);
   if(req.headers.origin!==origin||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){json(res,403,{error:'Same-origin JSON request and session token required.'});return;}
   if(!['/api/cv-library/save','/api/cv-library/reindex'].includes(url.pathname)){json(res,404,{error:'Unknown library endpoint.'});return;}
   const body=await new Promise((resolve,reject)=>{
    let size=0,chunks=[];const timer=setTimeout(()=>finish(Object.assign(Error('Request timeout.'),{status:408})),10000);
    const cleanup=()=>{clearTimeout(timer);req.off('data',data);req.off('end',end);req.off('error',error);};
    const finish=(e,value)=>{cleanup();if(e){req.resume();reject(e);}else resolve(value);};
    const data=chunk=>{size+=chunk.length;if(size>524288){finish(Object.assign(Error('Request too large.'),{status:413}));return;}chunks.push(chunk);};
    const end=()=>{try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{finish(Object.assign(Error('Invalid JSON.'),{status:400}));}};
    const error=()=>finish(Object.assign(Error('Request interrupted.'),{status:400}));req.on('data',data);req.on('end',end);req.on('error',error);
   });
   if(body.confirm!==true){json(res,400,{error:'Explicit confirmation is required.'});return;}
   json(res,200,url.pathname.endsWith('/save')?await library.save(body):await library.reindex(body));
  }catch(e){if(!res.headersSent)json(res,Number.isInteger(e.status)?e.status:409,{error:e.status?e.message:'Library operation failed. Check the catalogue, CV_FOLDER and local file access. No substitute evidence was used.'});else res.end();}
 });
 return library;
}
