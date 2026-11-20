import test from 'node:test';import assert from 'node:assert/strict';
import {partitionQueueSelection,executeBulkSend,shortSendLabel,skipSummary} from '../../src/interfaces/http/outreach-bulk.js';
const item=(id,extra={})=>({id,applicationKey:'app',contactId:id,email:id+'@business.test',status:'new',sendAction:{eligible:true,mode:'new',label:'Send email'},...extra});
function fixture({items=[item('a'),item('b')],confirm=true,prepareError,commitError,repeatRace,expires=false,stopAfterFirst=false,saveError}={}){
 const calls=[],saved=[],confirmations=[];let stopped=false;const now=100000;
 const api=async(url,p)=>{calls.push([url,p]);
  if(url.endsWith('send-cancel'))return {cancelled:true};
  if(url.endsWith('send-prepare')){
   if(prepareError===p.queueId)throw new Error('preparation failed');
   return {ticket:p.queueId,expiresAt:expires?now-1:now+300000,mode:repeatRace===p.queueId?'repeat':'new',recipient:p.queueId+'@business.test',subject:'Application',sendingAccount:'sender@business.test',attachments:[{name:'CV.pdf',sizeBytes:10}]};
  }
  if(url.endsWith('send-commit')){if(stopAfterFirst)stopped=true;if(commitError===p.ticket){const e=new Error('uncertain send');e.data={code:'SEND_UNKNOWN'};throw e;}return {sent:true,messageId:'sent-'+p.ticket};}
  throw new Error('Unexpected API');
 };
 return {calls,saved,confirmations,run:()=>executeBulkSend({items,ids:items.map(i=>i.id),api,save:async id=>{saved.push(id);if(saveError===id)throw new Error('save failed');},confirm:async data=>{confirmations.push(data);return confirm;},isStopped:()=>stopped,now:()=>now,sleep:async()=>{}})};
}
test('mixed send selection excludes sent, uncertain and duplicate application/address',()=>{
 const rows=[item('a'),item('b',{status:'drafted',sendAction:{eligible:true,mode:'draft'}}),item('c',{status:'sent',sendAction:{eligible:true,mode:'repeat'}}),item('d',{status:'send_unknown',sendAction:{eligible:false,reason:'uncertain'}}),item('e',{email:'a@business.test'})];
 const r=partitionQueueSelection(rows,rows.map(i=>i.id),'send');assert.deepEqual(r.eligible.map(i=>i.id),['a','b']);assert.equal(r.skipped.length,3);
});
test('draft selection skips completed rows and permits safe failed drafts',()=>{const r=partitionQueueSelection([item('a',{status:'drafted'}),item('b',{status:'draft_failed',safeToRetry:true})],['a','b'],'draft');assert.deepEqual(r.eligible.map(i=>i.id),['b']);});
test('labels stay concise and repeat action stays explicit',()=>{assert.equal(shortSendLabel('Send email'),'Send');assert.equal(shortSendLabel('Send draft'),'Send draft');assert.equal(shortSendLabel('Send again'),'Send again');});
test('one confirmation occurs after all preparations, before any commit',async()=>{const f=fixture();const r=await f.run();assert.equal(f.confirmations.length,1);assert.equal(f.confirmations[0].prepared.length,2);assert.equal(r.results.filter(r=>r.kind==='sent').length,2);assert.ok(f.calls.findIndex(c=>c[0].endsWith('send-commit'))>f.calls.map(c=>c[0]).lastIndexOf('/api/outreach-queue/send-prepare'));assert.ok(f.calls.filter(c=>c[0].endsWith('send-commit')).every(c=>c[1].repeatApproved===false));});
test('cancelling causes zero sends and releases all tickets',async()=>{const f=fixture({confirm:false});const r=await f.run();assert.equal(f.calls.filter(c=>c[0].endsWith('send-commit')).length,0);assert.equal(f.calls.filter(c=>c[0].endsWith('send-cancel')).length,2);assert.equal(r.confirmed,false);});
test('failed save prevents preparation and send for that row',async()=>{const f=fixture({saveError:'a'});const r=await f.run();assert.equal(r.results.find(r=>r.id==='a').kind,'not_prepared');assert.equal(f.calls.some(c=>c[0].endsWith('send-prepare')&&c[1].queueId==='a'),false);assert.equal(r.results.find(r=>r.id==='b').kind,'sent');});
test('preparation error excludes a row but confirmation lists the exact remainder',async()=>{const f=fixture({prepareError:'a'});await f.run();assert.deepEqual(f.confirmations[0].prepared.map(p=>p.item.id),['b']);});
test('concurrent change to repeat mode is never silently sent in bulk',async()=>{const f=fixture({repeatRace:'a'});const r=await f.run();assert.equal(r.results.find(r=>r.id==='a').kind,'skipped');assert.equal(f.calls.some(c=>c[0].endsWith('send-commit')&&c[1].ticket==='a'),false);});
test('expired preparations are not refreshed and silently sent',async()=>{const f=fixture({expires:true});const r=await f.run();assert.equal(f.confirmations.length,0);assert.equal(f.calls.filter(c=>c[0].endsWith('send-prepare')).length,2);assert.equal(r.results.filter(r=>r.kind==='not_prepared').length,2);});
test('uncertain sends are reported once and never retried',async()=>{const f=fixture({commitError:'a'});const r=await f.run();assert.equal(r.results.find(r=>r.id==='a').kind,'uncertain');assert.equal(f.calls.filter(c=>c[0].endsWith('send-commit')&&c[1].ticket==='a').length,1);});
test('stop after current completes no subsequent send',async()=>{const f=fixture({stopAfterFirst:true});const r=await f.run();assert.equal(r.results.filter(r=>r.kind==='sent').length,1);assert.equal(r.results.filter(r=>r.kind==='stopped').length,1);});
test('selection above 25 is processed with separate approvals and no selection rejection',async()=>{const f=fixture({items:Array.from({length:26},(_,i)=>item(String(i)))});const result=await f.run();assert.equal(f.confirmations.length,2);assert.deepEqual(f.confirmations.map(c=>c.prepared.length),[25,1]);assert.equal(result.results.filter(r=>r.kind==='sent').length,26);});
test('missing/duplicate row IDs do not cause extra sends',()=>{const r=partitionQueueSelection([item('a')],['a','a','missing'],'send');assert.equal(r.eligible.length,1);assert.equal(r.skipped.length,1);});

import {showBulkConfirmation} from '../../src/interfaces/http/outreach-bulk.js';
class E{
 constructor(tag,doc){this.tag=tag;this.doc=doc;this.children=[];this.events={};this.attributes={};}
 appendChild(child){this.children.push(child);return child;}append(...nodes){this.children.push(...nodes);}setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,fn){this.events[k]=fn;}
 createTHead(){const e=new E('thead',this.doc);this.appendChild(e);return e;}createTBody(){const e=new E('tbody',this.doc);this.appendChild(e);return e;}
 insertRow(){const e=new E('tr',this.doc);this.appendChild(e);return e;}insertCell(){const e=new E('td',this.doc);this.appendChild(e);return e;}
 showModal(){this.doc.dialog=this;}close(v=''){this.returnValue=v;this.events.close();}remove(){this.removed=true;}
}
function walk(node){return [node,...node.children.flatMap(walk)];}
test('confirmation lists every exact recipient and defaults to Cancel',async()=>{
 const doc={createElement(tag){return new E(tag,this);}};doc.body=new E('body',doc);
 const entries=['a','b'].map(id=>({item:item(id),prepared:{mode:'new',recipient:id+'@business.test',sendingAccount:'sender@business.test',subject:'Application',attachments:[{name:'CV.pdf',sizeBytes:10}]}}));
 const promise=showBulkConfirmation({prepared:entries,results:[],items:entries.map(p=>p.item),selectedCount:2},doc);
 const nodes=walk(doc.dialog);for(const id of ['a','b'])assert.ok(nodes.some(n=>n.textContent===id+'@business.test'));
 const cancel=nodes.find(n=>n.textContent==='Cancel');assert.equal(cancel.autofocus,true);cancel.events.click();assert.equal(await promise,false);
});
test('only explicit Send confirmation resolves approval',async()=>{
 const doc={createElement(tag){return new E(tag,this);}};doc.body=new E('body',doc);
 const p=showBulkConfirmation({prepared:[{item:item('a'),prepared:{mode:'draft',recipient:'a@business.test',subject:'Application'}}],results:[],items:[],selectedCount:1},doc);
 walk(doc.dialog).find(n=>n.textContent==='Send 1 emails').events.click();assert.equal(await p,true);
});
test('capacity error pauses preparation without opening confirmation',async()=>{
 const items=[item('a'),item('b'),item('c')],calls=[];let approved;
 const result=await executeBulkSend({items,ids:items.map(i=>i.id),save:async()=>{},now:()=>1000,confirm:async data=>{approved=data;return false;},api:async(url,p)=>{
  calls.push([url,p]);if(url.endsWith('send-cancel'))return {};
  if(p.queueId==='b')throw new Error('Too many pending confirmations');return {ticket:'a',expiresAt:999999,mode:'new',recipient:'a@business.test'};
 }});
 assert.equal(calls.some(c=>c[1].queueId==='c'),false);assert.equal(approved,undefined);assert.equal(result.confirmed,false);assert.ok(result.results.some(r=>r.kind==='stopped'));
});
test('skip summary explains each distinct reason once with a row count',()=>{
 const sel=partitionQueueSelection([item('a',{status:'sent'}),item('b',{status:'sent'}),item('c',{letterGate:{allowed:false,message:'Not polished.'}}),item('d')],['a','b','c','d'],'send');
 assert.equal(sel.eligible.length,1);
 assert.equal(skipSummary(sel),'Already sent; use explicit row-level Send again. (2 rows) Not polished.');
 assert.equal(skipSummary({skipped:[]}),'');
});
