import {once} from 'node:events';
import {createLocalServer} from '../../../src/interfaces/http/create-local-server.js';
export async function startScenarioFixture(){
 const body='Dear {{firstname}},\n\nI led delivery.\n\nWarm regards,\nTest Person';
 const proposed='Dear {{firstname}},\n\nAt EXAMPLE, I coordinated documented delivery.\n\nWarm regards,\nTest Person';
 const cv={role_code:'PM',role_name:'Project Manager'};
 const a={id:'assignment',revision:1,data:{title:'EXAMPLE assignment'},scenarios:[1,2,3].map(i=>({id:'case-'+i,revision:1,assignment_revision:1,data:{title:'Approved scenario '+i,approved:true,evidenceState:'source-supported',approvedWording:'At EXAMPLE, I coordinated documented delivery '+i+'.',sourceReference:'PRIVATE reference',sourceQuote:'PRIVATE source passage'}}))};
 const library={a,list(){return {items:[{id:a.id}]};},get(id){if(id!==a.id)throw Error('missing');return {...structuredClone(a),scenarios:a.scenarios.map(s=>({...structuredClone(s),approvalCurrent:s.assignment_revision===a.revision}))};}};
 const reviews=new Map([['review',{formData:{jobTitle:'Delivery Manager',jobDescriptionText:'Lead delivery',organisationName:'Example',advertiserRelationship:'unknown'},prepared:{jobDescription:{role:'Delivery Manager'},coverLetter:{subject:'Application',plainText:body},recommendation:{bestCv:cv,ats:{score:70}},rankedCvs:[]},currentDraftPlainText:body,currentDraftSubject:'Application',selectedCvRoleCode:'PM'}]]),calls=[];
 const server=createLocalServer({applicationReviewStore:reviews,assignmentEvidenceStore:library,cvEvidenceLoader:async()=>({selectedCvText:'Synthetic CV evidence',candidateDisplayName:'Test Person'}),coverLetterRefinementPort:{async refine(request){calls.push(request);return {proposedDraft:proposed,warnings:[],highlightPhrases:[]};}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');return {library,reviews,calls,url:'http://127.0.0.1:'+server.address().port,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
