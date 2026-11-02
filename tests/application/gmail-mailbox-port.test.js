import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable, Writable } from 'node:stream';
import { createGmailMailboxPort,runGmailMailboxWorker } from '../../src/application/gmail-mailbox-port.js';
import { createOutreachHttpHandler } from '../../src/interfaces/http/outreach-queue-http.js';
const env={ENABLE_GMAIL_MAILBOX_CHECK:'true',GMAIL_FROM_ADDRESS:'sender@example.test',GMAIL_OAUTH_CLIENT_ID:'PRIVATE_ID',GMAIL_OAUTH_CLIENT_SECRET:'PRIVATE_SECRET',GMAIL_OAUTH_REFRESH_TOKEN:'PRIVATE_TOKEN'};
const result={ok:true,authenticated:true,mailbox:'sender@example.test',draftCreated:false,sent:false};
test('status exposes presence/configured address but not secrets and performs no check',()=>{
 let calls=0;const port=createGmailMailboxPort({env,runner:async()=>{calls++;return result;}});const status=port.getStatus();
 assert.equal(status.configurationReady,true);assert.equal(status.draftCreationEnabled,false);assert.equal(calls,0);assert.ok(!JSON.stringify(status).includes('PRIVATE'));
});
test('disabled flag prevents runner invocation',async()=>{
 let calls=0;const port=createGmailMailboxPort({env:{...env,ENABLE_GMAIL_MAILBOX_CHECK:'false'},runner:async()=>{calls++;return result;}});
 await assert.rejects(port.check({confirmed:true,expectedAddress:env.GMAIL_FROM_ADDRESS}),error=>error.code==='GMAIL_CHECK_DISABLED');assert.equal(calls,0);
});
test('missing config or confirmation fails before authentication',async()=>{
 let calls=0;const runner=async()=>{calls++;return result;};
 await assert.rejects(createGmailMailboxPort({env:{...env,GMAIL_OAUTH_REFRESH_TOKEN:''},runner}).check({confirmed:true,expectedAddress:env.GMAIL_FROM_ADDRESS}),/missing/);
 await assert.rejects(createGmailMailboxPort({env,runner}).check({confirmed:false,expectedAddress:env.GMAIL_FROM_ADDRESS}),/Confirm/);assert.equal(calls,0);
});
test('changed target is rejected before authentication',async()=>{
 let calls=0;const port=createGmailMailboxPort({env,runner:async()=>{calls++;return result;}});
 await assert.rejects(port.check({confirmed:true,expectedAddress:'other@example.test'}),/configuration changed/);assert.equal(calls,0);
});
test('verified mailbox is accepted without draft or send actions',async()=>{
 const port=createGmailMailboxPort({env,runner:async()=>result});const checked=await port.check({confirmed:true,expectedAddress:env.GMAIL_FROM_ADDRESS});
 assert.equal(checked.mailboxMatch,true);assert.equal(checked.draftCreated,false);assert.equal(checked.sent,false);
});
test('account mismatch is visible and not treated as ready',async()=>{
 const port=createGmailMailboxPort({env,runner:async()=>({...result,ok:false,mailbox:'other@example.test',code:'GMAIL_MAILBOX_MISMATCH'})});
 const checked=await port.check({confirmed:true,expectedAddress:env.GMAIL_FROM_ADDRESS});assert.equal(checked.ok,false);assert.equal(checked.mailboxMatch,false);
});
test('raw runner errors cannot leak credentials',async()=>{
 const port=createGmailMailboxPort({env,runner:async()=>{throw new Error('PRIVATE_TOKEN');}});
 await assert.rejects(port.check({confirmed:true,expectedAddress:env.GMAIL_FROM_ADDRESS}),error=>!error.message.includes('PRIVATE'));
});
test('side-effectful result is rejected',async()=>{
 const port=createGmailMailboxPort({env,runner:async()=>({...result,sent:true})});await assert.rejects(port.check({confirmed:true,expectedAddress:env.GMAIL_FROM_ADDRESS}),/read-only/);
});
function fakeSpawn(body){return()=>{
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
 child.stdin=new Writable({write(chunk,enc,cb){cb();},final(cb){cb();setImmediate(()=>{child.stdout.emit('data',JSON.stringify(body));child.emit('close',0);});}});return child;
};}
test('worker transport accepts the strict read-only response',async()=>{
 const checked=await runGmailMailboxWorker({expectedAddress:env.GMAIL_FROM_ADDRESS,spawnImpl:fakeSpawn(result)});assert.equal(checked.mailbox,'sender@example.test');
});
test('worker transport refuses result without safety fields',async()=>{
 await assert.rejects(runGmailMailboxWorker({expectedAddress:env.GMAIL_FROM_ADDRESS,spawnImpl:fakeSpawn({ok:true})}),/safety/);
});
async function request(handler,path,method,payload,origin){
 const req=Readable.from(payload===undefined?[]:[Buffer.from(JSON.stringify(payload))]);req.method=method;req.headers={host:'localhost',...(payload===undefined?{}:{'content-type':'application/json'}),...(origin?{origin}:{})};
 let status,data;const res={writeHead(code){status=code;},end(text){data=JSON.parse(text);}};await handler(req,res,new URL('http://localhost'+path));return {status,data};
}
test('HTTP status route does not invoke mailbox check or touch storage',async()=>{
 let checks=0;const handler=createOutreachHttpHandler({repository:null,gmailMailboxPort:{getStatus(){return {configurationReady:true};},async check(){checks++;return result;}}});
 const response=await request(handler,'/api/outreach-queue/gmail-status','GET');assert.equal(response.status,200);assert.equal(checks,0);
});
test('HTTP check invokes only the injected mailbox port',async()=>{
 let received;const handler=createOutreachHttpHandler({repository:null,gmailMailboxPort:{getStatus(){return{};},async check(value){received=value;return result;}}});
 const response=await request(handler,'/api/outreach-queue/check-mailbox','POST',{confirmed:true,expectedAddress:env.GMAIL_FROM_ADDRESS});
 assert.equal(response.status,200);assert.deepEqual(received,{confirmed:true,expectedAddress:env.GMAIL_FROM_ADDRESS});
});
test('cross-origin mailbox check is blocked before port execution',async()=>{
 let checks=0;const handler=createOutreachHttpHandler({repository:null,gmailMailboxPort:{getStatus(){return{};},async check(){checks++;return result;}}});
 const response=await request(handler,'/api/outreach-queue/check-mailbox','POST',{confirmed:true},'https://evil.test');assert.equal(response.status,403);assert.equal(checks,0);
});
