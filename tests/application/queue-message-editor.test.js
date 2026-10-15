import test from 'node:test';import assert from 'node:assert/strict';
import {createQueueMessageEditor,messageEditVersion,messagePresentation} from '../../src/application/queue-message-editor.js';
const body='Dear Zoe,\n\nI led delivery worth £2M.\n\nWarm regards,\nVijay DAFAL';
const base={id:'q',status:'new',applicationKey:'a',email:'zoe@business.test',firstname:'Zoe',subject:'Application',bodyPlainText:body,bodyHtml:body.replace(/\n/g,'<br>'),updatedAt:'original'};
function fixture(){let item=structuredClone(base),writes=0;const repository={getById:()=>structuredClone(item),updatePendingMessage(v){writes++;item={...item,bodyPlainText:v.bodyPlainText,bodyHtml:v.bodyHtml,updatedAt:'changed'};return structuredClone(item);}};return {service:createQueueMessageEditor({repository,env:{}}),set:delta=>Object.assign(item,delta),get writes(){return writes;},get item(){return item;}};}
const payload=()=>({queueId:'q',expectedVersion:messageEditVersion(base),bodyPlainText:body.replace('£2M','£3M'),bodyHtml:body.replace('£2M','£3M').replace(/\n/g,'<br>')});
test('rich display uses sanitized HTML and current edit version',()=>{const v=messagePresentation(base);assert.equal(v.canEditMessage,true);assert.match(v.editorHtml,/<br>/);assert.equal(v.editVersion.length,64);});
test('completed and uncertain rows are read-only',()=>{for(const status of ['drafted','draft_creating','draft_failed','draft_unknown','sent'])assert.equal(messagePresentation({...base,status}).canEditMessage,false);});
test('attempt record locks even an apparently new row',()=>{assert.equal(messagePresentation(base,{attempted:true}).canEditMessage,false);});
test('invalid stored HTML is never injected and becomes read-only',()=>{const v=messagePresentation({...base,bodyHtml:'<script>evil()</script>'});assert.equal(v.canEditMessage,false);assert.doesNotMatch(v.editorHtml,/<script>/);});
test('successful save changes only body and advances version',()=>{const f=fixture(),r=f.service.save(payload());assert.equal(r.saved,true);assert.match(r.item.bodyPlainText,/£3M/);assert.equal(r.item.subject,base.subject);assert.notEqual(r.item.editVersion,messageEditVersion(base));assert.equal(f.writes,1);});
test('stale edit is rejected without writing',()=>{const f=fixture();f.set({updatedAt:'another change'});assert.throws(()=>f.service.save(payload()),/changed elsewhere/);assert.equal(f.writes,0);});
test('existing operation state is rejected without writing',()=>{const f=fixture();f.set({status:'drafted'});assert.throws(()=>f.service.save(payload()),/no longer editable/);assert.equal(f.writes,0);});
test('recipient and candidate identity must be retained',()=>{for(const replacement of [['Dear Zoe,','Dear Other,'],['Vijay DAFAL','Candidate']]){const f=fixture(),p=payload();p.bodyPlainText=p.bodyPlainText.replace(...replacement);p.bodyHtml=p.bodyHtml.replace(...replacement);assert.throws(()=>f.service.save(p),/greeting/);assert.equal(f.writes,0);}});
test('plain and rich disagreement or unsafe tags cannot save',()=>{const f=fixture();assert.throws(()=>f.service.save({...payload(),bodyHtml:'<p>Other</p>'}),/disagree/);assert.throws(()=>f.service.save({...payload(),bodyHtml:'<script>bad</script>'}),/unsupported/);assert.equal(f.writes,0);});
test('version includes recipient, state and attachments',()=>{for(const delta of [{email:'other@business.test'},{status:'drafted'},{attachment:{relativePath:'other.pdf'}}])assert.notEqual(messageEditVersion({...base,...delta}),messageEditVersion(base));});
let createOutreachRepository;try{({createOutreachRepository}=await import('../../src/infrastructure/outreach/sqlite-outreach-repository.js'));}catch(e){if(e.code!=='ERR_UNKNOWN_BUILTIN_MODULE')throw e;}
const sql={skip:!createOutreachRepository?'node:sqlite unavailable here':false};
function db(){const r=createOutreachRepository({filePath:':memory:'});const item=r.addMany([{...base,contactId:'contact'}]).items[0];return {r,item};}
test('SQLite saves body atomically with compare-and-save',sql,()=>{const {r,item}=db();try{const saved=r.updatePendingMessage({queueId:item.id,expectedVersion:messageEditVersion(item),bodyPlainText:body,bodyHtml:base.bodyHtml});assert.equal(saved.id,item.id);assert.throws(()=>r.updatePendingMessage({queueId:item.id,expectedVersion:'0'.repeat(64),bodyPlainText:body,bodyHtml:base.bodyHtml}),/changed/);}finally{r.close();}});
test('SQLite refuses edits once a draft attempt is reserved',sql,()=>{const {r,item}=db();try{r.claimDraftOperation({queueId:item.id,sendingAccount:'sender@business.test'});assert.throws(()=>r.updatePendingMessage({queueId:item.id,expectedVersion:messageEditVersion(item),bodyPlainText:body,bodyHtml:base.bodyHtml}),/operation/);}finally{r.close();}});

import {createQueueMessageControl,saveQueuedMessageBeforeDraft} from '../../src/interfaces/http/queue-message-editor.js';
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.events={};this.attributes={};this.innerHTML='';this.innerText='';}
 appendChild(child){this.children.push(child);return child;}append(...children){this.children.push(...children);}
 setAttribute(key,value){this.attributes[key]=value;}addEventListener(name,fn){this.events[name]=fn;}
}
function dom(t){const oldDocument=globalThis.document,oldFetch=globalThis.fetch;globalThis.document={createElement:tag=>new Element(tag)};t.after(()=>{globalThis.document=oldDocument;globalThis.fetch=oldFetch;});}
function display(id){return {...base,id,...messagePresentation(base)};}
test('single rich control has no plain block or iframe and completed rows are read-only',t=>{
 dom(t);const control=createQueueMessageControl({...display('ui-readonly'),canEditMessage:false,messageReadOnlyReason:'Already drafted'});
 assert.equal(control.children.filter(c=>c.tag==='div').length,1);assert.equal(control.children.some(c=>['pre','iframe','textarea'].includes(c.tag)),false);
 assert.equal(control.children.find(c=>c.tag==='div').contentEditable,'false');
});
test('Draft autosave writes once and waits before allowing creation',async t=>{
 dom(t);const item=display('ui-save'),control=createQueueMessageControl(item),editor=control.children.find(c=>c.tag==='div');
 editor.innerHTML=body.replace('£2M','£3M').replace(/\n/g,'<br>');editor.innerText=body.replace('£2M','£3M');editor.events.input();
 let writes=0;globalThis.fetch=async(url,options)=>{writes++;const p=JSON.parse(options.body);assert.equal(p.expectedVersion,item.editVersion);return {ok:true,json:async()=>({ok:true,saved:true,item:{...item,bodyPlainText:p.bodyPlainText,editorHtml:p.bodyHtml,editVersion:'new-version'}})};};
 await saveQueuedMessageBeforeDraft(item.id);await saveQueuedMessageBeforeDraft(item.id);assert.equal(writes,1);
});
test('save failure rejects Draft continuation and keeps local edits',async t=>{
 dom(t);const item=display('ui-fail'),control=createQueueMessageControl(item),editor=control.children.find(c=>c.tag==='div');editor.innerHTML='<p>Edited</p>';editor.innerText='Edited';editor.events.input();
 globalThis.fetch=async()=>({ok:false,json:async()=>({ok:false,error:'Concurrent edit'})});
 await assert.rejects(saveQueuedMessageBeforeDraft(item.id),/Concurrent/);assert.equal(editor.innerHTML,'<p>Edited</p>');assert.equal(editor.contentEditable,'true');
});
test('queue refresh preserves a dirty edit and discard restores the latest saved version',t=>{
 dom(t);const item=display('ui-refresh');let control=createQueueMessageControl(item),editor=control.children.find(c=>c.tag==='div');editor.innerHTML='<p>Local edit</p>';editor.innerText='Local edit';editor.events.input();
 control=createQueueMessageControl({...item,editorHtml:'<p>New saved version</p>',editVersion:'next-version'});editor=control.children.find(c=>c.tag==='div');assert.equal(editor.innerHTML,'<p>Local edit</p>');
 control.children.find(c=>c.textContent==='Discard changes').events.click();assert.equal(editor.innerHTML,'<p>New saved version</p>');
});

import {createOutreachHttpHandler} from '../../src/interfaces/http/outreach-queue-http.js';
import {Readable} from 'node:stream';
async function http(handler,url,payload,origin){const req=Readable.from(payload===undefined?[]:[Buffer.from(JSON.stringify(payload))]);req.method=payload===undefined?'GET':'POST';req.headers={host:'localhost','content-type':'application/json',...(origin?{origin}:{})};let code,text,headers;await handler(req,{writeHead(c,h){code=c;headers=h;},end(t){text=t;}},new URL('http://localhost'+url));return {code,text,headers};}
test('HTTP list/save wiring exposes one sanitized editor and returns updated version',async()=>{
 let item=structuredClone(base);const repo={list:()=>[item],getById:()=>item,listDraftOperations:()=>[],updatePendingMessage(v){item={...item,bodyPlainText:v.bodyPlainText,bodyHtml:v.bodyHtml,updatedAt:'saved'};return item;}};
 const handler=createOutreachHttpHandler({repository:repo,getReview:()=>null,contactStore:{}});
 const list=JSON.parse((await http(handler,'/api/outreach-queue')).text),version=list.items[0].editVersion;assert.equal(list.items[0].canEditMessage,true);
 const response=await http(handler,'/api/outreach-queue/message-save',{...payload(),expectedVersion:version});assert.equal(response.code,200);assert.equal(JSON.parse(response.text).saved,true);
 const script=await http(handler,'/queue-message-editor.js');assert.equal(script.code,200);assert.match(script.text,/createQueueMessageControl/);
});
test('cross-origin save is blocked before any repository write',async()=>{
 const handler=createOutreachHttpHandler({repository:{list:()=>[],updatePendingMessage(){assert.fail('must not write');}},getReview:()=>null,contactStore:{}});
 assert.equal((await http(handler,'/api/outreach-queue/message-save',payload(),'https://untrusted.test')).code,403);
});
