import {readFile} from 'node:fs/promises';
const base='/api/application-intelligence';
const methods=new Map([['history','GET'],['assessments','GET'],['assessment','GET'],['capture','POST'],['submission','POST'],['void-submission','POST'],['delete-assessment','POST']]);
export function createApplicationIntelligenceHttp({service}){
 const json=(r,status,value)=>{r.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});r.end(JSON.stringify(value));};
 return async(req,res,url)=>{const route=url.pathname.startsWith(base+'/')?url.pathname.slice(base.length+1):'',asset=url.pathname==='/application-intelligence.js';if(!asset&&!methods.has(route))return false;try{
  const host=String(req.headers.host||'');if(!/^(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?$/i.test(host)||(req.headers.origin&&!['http://'+host,'https://'+host].includes(req.headers.origin))||req.headers['sec-fetch-site']==='cross-site'){json(res,403,{ok:false,error:'Local same-origin access required.'});return true;}if(req.method!==(asset?'GET':methods.get(route))){json(res,405,{ok:false,error:'Method not allowed.'});return true;}
  if(asset){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});res.end(await readFile(new URL('./application-intelligence.js',import.meta.url),'utf8'));return true;}
  if(!service){json(res,503,{ok:false,error:'Application intelligence unavailable in this runtime; history was not checked.'});return true;}
  let input={};if(req.method==='POST'){if(!req.headers.origin){json(res,403,{ok:false,error:'Same-origin browser request required.'});return true;}if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']||''))){json(res,415,{ok:false,error:'JSON required.'});return true;}const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>16384)throw Object.assign(Error('Request exceeds limit.'),{code:'INTELLIGENCE_INPUT',statusCode:413});chunks.push(Buffer.from(b));}try{input=JSON.parse(Buffer.concat(chunks));}catch{throw Object.assign(Error('Valid JSON required.'),{code:'INTELLIGENCE_INPUT',statusCode:400});}if(!input||typeof input!=='object'||Array.isArray(input))throw Object.assign(Error('Object required.'),{code:'INTELLIGENCE_INPUT',statusCode:400});}
  let value;
  if(route==='history')value=service.history(String(url.searchParams.get('reviewId')||''));
  else if(route==='assessments')value={items:service.assessments(String(url.searchParams.get('reviewId')||'')).map(a=>({id:a.id,cvRoleCode:a.cvRoleCode,cvFileHash:a.cvFileHash,jdHash:a.jdHash,scheme:a.scheme,status:a.status,coveragePercent:a.coveragePercent,termCount:a.terms.length,missingCount:a.missing.length,createdAt:a.createdAt}))};
  else if(route==='assessment')value={assessment:service.assessment(String(url.searchParams.get('id')||''),String(url.searchParams.get('reviewId')||''))};
  else if(route==='capture'){if(Object.keys(input).join(',')!=='reviewId')throw Object.assign(Error('Only reviewId is accepted.'),{code:'INTELLIGENCE_INPUT',statusCode:400});value={assessment:await service.capture(input.reviewId)};}
  else if(route==='submission')value={record:service.recordSubmission(input)};
  else if(route==='void-submission')value={record:service.voidSubmission(input)};
  else value=service.deleteAssessment(input);
  json(res,200,{ok:true,...value});
 }catch(e){const safe=e.code==='INTELLIGENCE_INPUT';json(res,safe?(e.statusCode||400):503,{ok:false,code:safe?e.code:'INTELLIGENCE_UNAVAILABLE',error:safe?e.message:'Local history/assessment data is unavailable. Do not interpret this as no previous application.'});}return true;};
}
