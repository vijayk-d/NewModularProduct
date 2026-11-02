import test from 'node:test';
import assert from 'node:assert/strict';
import {recipientFirstName,assertResolvedMessage} from '../../src/application/outreach-recipient-identity.js';
import {finalizeOutreachIdentity} from '../../src/application/outreach-final-identity.js';
import {prepareDraftSnapshot} from '../../src/application/outreach-message-snapshot.js';
import {createOutreachQueueService} from '../../src/application/outreach-queue-service.js';
const body='Dear {{firstname}},\n\nEvidence worth £2M — supplied, not invented.\n\nWarm regards,\nTest Candidate';
const item={id:'q',status:'new',email:'person@example.test',subject:'Application',bodyPlainText:body};
test('explicit names, camel-case names and full-name fallback resolve consistently',()=>{
 assert.equal(recipientFirstName({firstname:' Zoe ',fullName:'Other Name'}),'Zoe');
 assert.equal(recipientFirstName({firstName:'Renée'}),'Renée');
 assert.equal(recipientFirstName({firstname:'  ',fullName:'  Alex Smith '}),'Alex');
});
test('only missing or whitespace names use Hiring Manager',()=>{
 for(const contact of [{},{fullName:' '},{firstname:'  ',firstName:' '}])assert.equal(recipientFirstName(contact),'Hiring Manager');
});
test('unsafe names reject instead of silently falling back',()=>{
 for(const firstname of ['{{firstname}}','Alex\nBcc: x','<b>Alex</b>','https://example.test','a@b.test'])assert.throws(()=>recipientFirstName({firstname}),/Recipient name/);
});
test('plain final identity resolves fallback, candidate and preserves supplied evidence',()=>{
 const r=finalizeOutreachIdentity({bodyPlainText:body},{candidateName:'Test Candidate'});
 assert.ok(r.bodyPlainText.startsWith('Dear Hiring Manager,'));assert.ok(r.bodyPlainText.endsWith('Test Candidate'));assert.ok(r.bodyPlainText.includes('£2M — supplied, not invented.'));
});
test('rich final identity preserves emphasis and advert hyperlink',()=>{
 const url='https://example.test/job';
 const plain=body.replace('Evidence worth','Job advert: '+url+'\n\nEvidence worth');
 const html=body.replace('Evidence worth','Job advert: <a href="'+url+'">Job advert</a>\n\n<strong>Evidence</strong> worth').replaceAll('\n','<br>');
 const r=finalizeOutreachIdentity({bodyPlainText:plain,bodyHtml:html},{firstName:'Zoë',candidateName:'Test Candidate',advertUrl:url});
 assert.ok(r.bodyPlainText.startsWith('Dear Zoë,'));assert.ok(r.bodyHtml.includes('<strong>Evidence</strong>'));assert.ok(r.bodyHtml.includes('href="'+url+'"'));
});
test('final identity rejects unresolved body tokens',()=>{
 assert.throws(()=>finalizeOutreachIdentity({bodyPlainText:body.replace('Evidence worth','{{unknown}} Evidence worth')},{firstName:'Alex',candidateName:'Test Candidate'}),/unresolved placeholder/);
});
test('draft preparation supports missing name with no remaining template tokens',()=>{
 const r=prepareDraftSnapshot(item);assert.equal(r.recipient.firstname,'Hiring Manager');assert.ok(r.bodyPlainText.startsWith('Dear Hiring Manager,'));assert.ok(!r.bodyHtml.includes('{{'));
});
test('draft preparation rejects unknown body and subject placeholders',()=>{
 assert.throws(()=>prepareDraftSnapshot({...item,subject:'Application {{role}}'}),/unresolved placeholder/);
 assert.throws(()=>prepareDraftSnapshot({...item,bodyPlainText:body.replace('Evidence','{{unknown}}')}),/unresolved placeholder/);
 assert.throws(()=>assertResolvedMessage('Text','<p>{{unknown}}</p>'),/unresolved placeholder/);
});
test('queue finalisation uses selected linked contact and generic fallback without a live repository',async()=>{
 let written=[];
 const review={formData:{jobTitle:'Coach'},prepared:{coverLetter:{subject:'Application'}}};
 const repository={addMany(items){written=items;return {items};}};
 const contactStore={async listByReview(){return [{id:'c1',firstName:'Zoë',fullName:'Zoë Test',selectedEmail:'zoe@example.test'},{id:'c2',fullName:' ',selectedEmail:'other@example.test'}];}};
 const service=createOutreachQueueService({repository,contactStore,getReview:()=>review});
 await service.add({reviewId:'r',recipients:[{contactId:'c1',email:'zoe@example.test'},{contactId:'c2',email:'other@example.test'}],bodyPlainText:body,finalizeIdentity:true});
 assert.ok(written[0].bodyPlainText.startsWith('Dear Zoë,'));assert.ok(written[1].bodyPlainText.startsWith('Dear Hiring Manager,'));
});
test('unlinked recipient prevents queue insertion',async()=>{
 let writes=0;
 const service=createOutreachQueueService({repository:{addMany(){writes++;}},contactStore:{async listByReview(){return [];}},getReview:()=>({formData:{},prepared:{coverLetter:{subject:'Application'}}})});
 await assert.rejects(service.add({reviewId:'r',recipients:[{contactId:'missing',email:'x@example.test'}],bodyPlainText:body,finalizeIdentity:true}),/not linked/);assert.equal(writes,0);
});
