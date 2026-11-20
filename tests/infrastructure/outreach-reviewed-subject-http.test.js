import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createOutreachHttpHandler } from '../../src/interfaces/http/outreach-queue-http.js';
function fixture() {
  const stored=[];
  const repository={list(){return structuredClone(stored);},async addMany(items){stored.push(...structuredClone(items));return {added:items.length,duplicates:0,items:structuredClone(stored)};}};
  const review={refinementHistory:[{appliedAt:'2026-11-20T10:00:00Z'}],formData:{jobTitle:'Delivery lead'},prepared:{coverLetter:{subject:'Application for delivery lead'}}};
  const handler=createOutreachHttpHandler({repository,getReview:()=>review,contactStore:{async listByReview(){return [{id:'contact',selectedEmail:'matt@example.test',fullName:'Matt Smith'}];}}});
  return {stored,async add(subject,include=true){
    const payload={reviewId:'review',recipients:[{contactId:'contact',email:'matt@example.test'}],bodyPlainText:'Reviewed draft',...(include?{subject}:{})};
    const request=Readable.from([Buffer.from(JSON.stringify(payload))]);request.method='POST';request.headers={'content-type':'application/json',host:'localhost'};
    let status,data;const response={writeHead(code){status=code;},end(text){data=JSON.parse(text);}};
    await handler(request,response,new URL('http://localhost/api/outreach-queue/add'));
    return {status,data};
  }};
}
test('HTTP queue accepts a validated edited subject',async()=>{
  const f=fixture();const result=await f.add('Reviewed subject');assert.equal(result.status,200);assert.equal(result.data.items[0].subject,'Reviewed subject');
});
test('HTTP queue uses prepared subject only when the edited field is omitted',async()=>{
  const f=fixture();const result=await f.add(undefined,false);assert.equal(result.status,200);assert.equal(result.data.items[0].subject,'Application for delivery lead');
});
test('HTTP queue rejects explicit blank or multiline subject without fallback or inserts',async()=>{
  for(const subject of ['', ' ', 'Reviewed\r\nBcc: other@example.test']){
    const f=fixture();const result=await f.add(subject);assert.equal(result.status,400);assert.equal(result.data.ok,false);assert.equal(f.stored.length,0);
  }
});
