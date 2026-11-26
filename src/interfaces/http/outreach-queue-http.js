import {createSendRun} from '../../application/send-run.js';
import {polishGate, assertPolished} from '../../application/polish-gate.js';
import {createGmailScheduling} from '../../application/gmail-scheduling.js';
import {createSchedulingHttp} from './gmail-scheduling-http.js';
import {createGmailSendService} from '../../application/gmail-send-service.js';
// outreach-bulk-controls-v1
import { createQueueMessageEditor, messagePresentation } from '../../application/queue-message-editor.js';
import { createConfirmedGmailDraftService } from '../../application/confirmed-gmail-draft-service.js';
import { createGmailMailboxPort } from '../../application/gmail-mailbox-port.js';
import { snapshotMessage } from '../../application/outreach-message-snapshot.js';
import { finalizeOutreachIdentity } from '../../application/outreach-final-identity.js';
import { queueSnapshotSubject } from '../../application/review-subject.js';
import { readFile } from 'node:fs/promises';
import { createOutreachQueueService } from '../../application/outreach-queue-service.js';

function outreachOrganisationKey(form={}) {
  const domain=String(form.emailDomain||'').trim().toLowerCase();if(domain)return `domain:${domain}`;
  try{const url=new URL(form.organisationUrl||''),host=url.hostname.toLowerCase().replace(/^www\./,'');
    if(host==='linkedin.com'||host.endsWith('.linkedin.com')){const company=url.pathname.match(/^\/company\/([^/]+)/i);return company?`linkedin-company:${company[1].toLowerCase()}`:'organisation:unknown';}
    return host?`domain:${host}`:'organisation:unknown';
  }catch{return 'organisation:unknown';}
}
export function createOutreachHttpHandler({ repository, contactStore, getReview, peekReview = null, gmailMailboxPort = null, gmailDraftCreationPort = null, gmailSendPort = null, tailoredAttachment = null, linkTracker = null }) {
  const mailboxPort = gmailMailboxPort || createGmailMailboxPort();
  const confirmedDrafts = gmailDraftCreationPort || createConfirmedGmailDraftService({repository,mailboxPort,linkTracker});
  const service = repository ? createOutreachQueueService({ repository, contactStore, getReview, tailoredAttachment }) : null;
  const sends=gmailSendPort||createGmailSendService({repository,mailboxPort,linkTracker});
  // Approved batches are sent by the server, so clicking elsewhere does not interrupt them (see send-run.js).
  const sendRun=createSendRun({sends});
  // Polish gate: queueing, drafting, sending and scheduling need the polished letter applied (or a deliberate override).
  const gateForReview=reviewId=>polishGate(getReview?.(reviewId));
  const assertQueueItemPolished=queueId=>{const item=service?.list().find(i=>i.id===queueId);if(item)assertPolished(getReview?.(item.reviewId));};
  const baseScheduling=createGmailScheduling({sends,repository});
  const gatedScheduling={...baseScheduling,prepare:async args=>{assertQueueItemPolished(args?.queueId);return baseScheduling.prepare(args);}};
  const handleScheduling=createSchedulingHttp({sends,repository,scheduling:gatedScheduling});
  const messageEditor=repository?createQueueMessageEditor({repository}):null;
  const json = (response, code, data) => {
    response.writeHead(code, { 'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    response.end(JSON.stringify(data));
  };
  async function body(request) {
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      const error = new Error('JSON content type is required.'); error.statusCode = 415; throw error;
    }
    const chunks=[]; let bytes = 0;
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) {
        const error = new Error('Queue request is too large.'); error.statusCode = 413; throw error;
      }
      chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { const error = new Error('Request body must be valid JSON.'); error.statusCode = 400; throw error; }
  }
  return async function handleOutreach(request, response, url) {
    if(await handleScheduling(request,response,url))return true;
    const route = url.pathname;
    if (!['/outreach-queue', '/outreach-queue.js', '/outreach-simple-contacts.js', '/outreach-workflow.css', '/queue-message-editor.js', '/outreach-bulk.js','/outreach-schedule.js', '/api/outreach-queue',
      '/api/outreach-queue/add', '/api/outreach-queue/delete', '/api/outreach-queue/clear', '/api/outreach-queue/prepare-drafts', '/api/outreach-queue/gmail-status', '/api/outreach-queue/check-mailbox', '/api/outreach-queue/gmail-draft-status', '/api/outreach-queue/gmail-draft-preview', '/api/outreach-queue/gmail-draft-create', '/api/outreach-queue/draft-one', '/api/outreach-queue/link-and-add', '/api/outreach-queue/message-save','/api/outreach-queue/send-status','/api/outreach-queue/send-prepare','/api/outreach-queue/send-commit','/api/outreach-queue/send-cancel','/api/outreach-queue/send-history','/api/outreach-queue/send-run','/api/outreach-queue/send-run/stop'].includes(route)) return false;
    try {
      const origin = request.headers.origin;
      if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) {
        json(response, 403, { ok: false, error: 'Cross-origin queue access is not allowed.' }); return true;
      }
      if (request.headers['sec-fetch-site'] === 'cross-site') {
        json(response, 403, { ok: false, error: 'Cross-site queue access is not allowed.' }); return true;
      }
      if(request.method==='GET' && ['/outreach-simple-contacts.js','/outreach-workflow.css','/queue-message-editor.js','/outreach-bulk.js','/outreach-schedule.js'].includes(route)){
        const file=route.slice(1);
        response.writeHead(200,{'content-type':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
        response.end(await readFile(new URL('./'+file,import.meta.url),'utf8'));return true;
      }
      if (request.method === 'GET' && route === '/outreach-queue.js') {
        const code = await readFile(new URL('./outreach-queue-browser.js', import.meta.url), 'utf8');
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options': 'nosniff' });
        response.end(code); return true;
      }
      if (request.method === 'GET' && route === '/outreach-queue') {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
          'content-security-policy': "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          'x-content-type-options': 'nosniff'
        });
        response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Outreach queue</title></head>
          <body><main><h1>Outreach queue</h1>
          <p>Draft and Send are separate actions. Sending requires explicit enablement and confirmation.</p></main>
          <script type="module" src="/outreach-queue.js"></script></body></html>`);
        return true;
      }
      // outreach-send-pilot-v1
      if(request.method==='GET'&&route==='/api/outreach-queue/send-status'){json(response,200,{ok:true,...sends.getStatus()});return true;}
      if(request.method==='POST'&&route==='/api/outreach-queue/send-prepare'){const values=await body(request);assertQueueItemPolished(values?.queueId);json(response,200,{ok:true,...await sends.prepare(values)});return true;}
      if(request.method==='GET'&&route==='/api/outreach-queue/send-run'){json(response,200,{ok:true,run:sendRun.status()});return true;}
      if(request.method==='POST'&&route==='/api/outreach-queue/send-run'){const values=await body(request);json(response,200,{ok:true,run:sendRun.start(values||{})});return true;}
      if(request.method==='POST'&&route==='/api/outreach-queue/send-run/stop'){json(response,200,{ok:true,run:sendRun.stop()});return true;}
      if(request.method==='POST'&&route==='/api/outreach-queue/send-cancel'){json(response,200,{ok:true,...sends.cancel(await body(request))});return true;}
      if(request.method==='POST'&&route==='/api/outreach-queue/send-commit'){
        const result=await sends.commit(await body(request));console.info('[OUTREACH_SEND]\n'+JSON.stringify({sent:result.sent,messageId:result.messageId||null,persistenceConfirmed:result.persistenceConfirmed!==false},null,2));
        json(response,result.error?503:200,{ok:!result.error,...result});return true;
      }
      if(request.method==='GET'&&route==='/api/outreach-queue/send-history'){
        if(!repository?.listSentEmails)throw Object.assign(new Error('History unavailable.'),{statusCode:503});
        const q=String(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,200);
        const all=repository.listSentEmails().filter(r=>!q||[r.fullName,r.email,r.subject].some(v=>String(v||'').toLowerCase().includes(q)));
        const pages=Math.max(1,Math.ceil(all.length/10)),page=Math.min(pages,Math.max(1,parseInt(url.searchParams.get('page')||'1',10)||1));
        const items=all.slice((page-1)*10,page*10).map(r=>({id:r.id,fullName:r.fullName,email:r.email,subject:r.subject,action:r.action||'send',sentAt:r.sentAt,status:'sent',messageId:r.messageId,linkedinUrl:typeof r.linkedinUrl==='string'?r.linkedinUrl:''}));
        json(response,200,{ok:true,items,total:all.length,page,pages});return true;
      }
      // queue-single-editor-v1
      if(request.method==='POST'&&route==='/api/outreach-queue/message-save'){
        if(!messageEditor)throw Object.assign(new Error('Queue storage is unavailable.'),{statusCode:503});
        json(response,200,{ok:true,...messageEditor.save(await body(request))});return true;
      }
      if (request.method === 'GET' && route === '/api/outreach-queue/gmail-status') {
        json(response,200,{ok:true,...mailboxPort.getStatus()});return true;
      }
      if (request.method === 'POST' && route === '/api/outreach-queue/check-mailbox') {
        const values=await body(request);
        const result=await mailboxPort.check({confirmed:values.confirmed,expectedAddress:values.expectedAddress});
        json(response,result.ok?200:409,result);return true;
      }
      if (request.method === 'GET' && route === '/api/outreach-queue/gmail-draft-status') {
        json(response,200,{ok:true,...confirmedDrafts.getStatus()});return true;
      }
      if (request.method === 'POST' && route === '/api/outreach-queue/gmail-draft-preview') {
        const values=await body(request);assertQueueItemPolished(values?.queueId);const result=await confirmedDrafts.preview(values);
        json(response,200,{ok:true,...result});return true;
      }
      if (request.method === 'POST' && route === '/api/outreach-queue/gmail-draft-create') {
        const values=await body(request);const result=await confirmedDrafts.create(values);
        json(response,result.error?503:200,{ok:!result.error,...result});return true;
      }
      if(request.method==='POST'&&route==='/api/outreach-queue/draft-one'){
        if(typeof confirmedDrafts.draftOne!=='function')throw Object.assign(new Error('Direct drafting unavailable.'),{statusCode:503});
        const values=await body(request);assertQueueItemPolished(values?.queueId);
        console.info('[OUTREACH_ACTION]\n'+JSON.stringify({event:'draft_started',queueId:values.queueId},null,2));
        const result=await confirmedDrafts.draftOne(values);
        console.info('[OUTREACH_ACTION]\n'+JSON.stringify({event:'draft_result',queueId:values.queueId,created:result.created===true,draftId:result.draftId||null,persistenceConfirmed:result.persistenceConfirmed!==false},null,2));
        json(response,result.error?503:200,{ok:!result.error,...result});return true;
      }
      if (!service) { json(response, 503, { ok: false, error: 'Outreach storage is not configured.' }); return true; }
      if (request.method === 'GET' && route === '/api/outreach-queue') {
        const messageAttempts=[...(repository.listDraftOperations?.()||[]),...(repository.listSendAttempts?.()||[])];const sendStatus=sends.getStatus();
        // Built once per list: attempted keys, the polish gate per application (light read) and the send history.
        const attemptedKeys=new Set(messageAttempts.map(a=>a.applicationKey+'\n'+a.recipientKey));
        const gates=new Map(),gateOnce=id=>{if(!gates.has(id))gates.set(id,polishGate((peekReview||getReview)?.(id)));return gates.get(id);};
        const sendContext=typeof sends.eligibilityContext==='function'?sends.eligibilityContext(sendStatus.configuredMailbox):null;
        const scope=url.searchParams.get('reviewId');
        if(scope!==null&&(!/^[A-Za-z0-9-]{1,100}$/.test(scope)||!getReview(scope))){json(response,404,{ok:false,error:'Application review not found; no queue records returned.'});return true;}
        const items=service.list().filter(item=>scope===null||item.reviewId===scope).map(item=>{const operation=item.draftOperationId&&repository.getDraftOperationById?.(item.draftOperationId);
          const letterGate=gateOnce(item.reviewId),eligibility=sendContext?sends.eligibility(item,sendStatus.configuredMailbox,sendContext):sends.eligibility(item,sendStatus.configuredMailbox);
          return {...item,letterGate,sendAction:letterGate.allowed||item.status==='sent'?eligibility:{...eligibility,eligible:false,reason:letterGate.message},...messagePresentation(item,{attempted:attemptedKeys.has(item.applicationKey+'\n'+String(item.email||'').toLowerCase())}),safeToRetry:operation?.status==='failed'&&operation.safeToRetry===true};});
        json(response, 200, { ok: true, items }); return true;
      }
      if (request.method === 'POST' && route !== '/api/outreach-queue') {
        const values = await body(request);
        let result;
        if(route==='/api/outreach-queue/link-and-add'){
          const review=getReview(values.reviewId);
          if(!review)throw Object.assign(new Error('The application review expired. Prepare it again.'),{statusCode:410});
          assertPolished(review);
          if(!contactStore?.saveOutreachCandidates)throw Object.assign(new Error('Contact editing is unavailable.'),{statusCode:503});
          if(!Array.isArray(values.rows)||!values.rows.length||values.rows.length>100)throw Object.assign(new Error('Select between 1 and 100 address rows.'),{statusCode:400});
          const snapshot=snapshotMessage(values.bodyPlainText,values.bodyHtml,review.formData?.jobAdvertLink||'');
          queueSnapshotSubject(review,values.subject);
          for(const row of values.rows)finalizeOutreachIdentity(snapshot,{firstName:row.firstName,candidateName:process.env.CANDIDATE_DISPLAY_NAME||'Vijay DAFAL',advertUrl:review.formData?.jobAdvertLink||''});
          const recipients=await contactStore.saveOutreachCandidates({reviewId:values.reviewId,rows:values.rows,organisationId:outreachOrganisationKey(review.formData)});
          try{result=await service.add({...values,recipients,finalizeIdentity:true});}
          catch(error){error.message='Contacts saved and linked; queueing failed: '+error.message;throw error;}
        }
        else if (route === '/api/outreach-queue/add') { const queuedReview = getReview(values.reviewId); if (queuedReview) assertPolished(queuedReview); result = await service.add(values); }
        else if (route === '/api/outreach-queue/prepare-drafts') result = service.prepareDrafts(values);
        else if (route === '/api/outreach-queue/delete') result = service.deleteSelected(values);
        else if (route === '/api/outreach-queue/clear') result = service.clear(values);
        else { json(response, 405, { ok: false, error: 'Method not allowed.' }); return true; }
        json(response, 200, { ok: true, ...result }); return true;
      }
      json(response, 405, { ok: false, error: 'Method not allowed.' });
    } catch (error) {
      // outreach-content-diagnostics-v1: quality checks are not database failures.
      const contentCodes=new Set(['REFINEMENT_BODY_REJECTED','REFINEMENT_BODY_LINK_REJECTED','REFINEMENT_COMMENTARY_REJECTED','REFINEMENT_EXCLUDED_EMPLOYER']);
      const contentError=contentCodes.has(error.code),statusCode=contentError?400:(error.statusCode||503);
      const safe=error.safeDiagnostics?{
        htmlLikeCount:Number.isSafeInteger(error.safeDiagnostics.htmlLikeCount)?Math.max(0,error.safeDiagnostics.htmlLikeCount):0,
        tagCategories:Array.isArray(error.safeDiagnostics.tagCategories)?error.safeDiagnostics.tagCategories.filter(v=>/^(?:a|p|br|div|span|strong|b|em|i|u|mark|ul|ol|li|table|tr|td|th|html|body|font|h1|h2|h3|http|https|other)$/.test(v)).slice(0,10):[]
      }:undefined;
      json(response,statusCode,{ok:false,code:error.code||'OUTREACH_ERROR',error:contentError||error.statusCode?error.message:'Outreach storage is unavailable. Check the server terminal; do not delete the database.',...(safe?{diagnostics:safe}:{})});
      if(contentError)console.warn('[OUTREACH_VALIDATION]\n'+JSON.stringify({route,code:error.code,statusCode,...(safe||{})},null,2));
      else if(!error.statusCode)console.error('[Outreach queue] Storage request failed:',error.code||error.name);
    }
    return true;
  };
}


