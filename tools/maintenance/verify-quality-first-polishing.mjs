import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseEnv} from 'node:util';
const root=fileURLToPath(new URL('../../',import.meta.url));
try{
 if(process.argv.length!==2)throw Error('This verification takes no arguments.');
 if(await fs.stat(path.join(root,'release.json')).then(()=>true).catch(e=>{if(e.code==='ENOENT')return false;throw e;}))throw Error('Production release refused.');
 const e=parseEnv((await fs.readFile(path.join(root,'.env'),'utf8')).replace(/^\uFEFF/,''));
 if((e.NMP_ENV||'development')!=='development'||String(e.PORT||'3000')!=='3000'||!['127.0.0.1','localhost','::1'].includes(e.HOST||'127.0.0.1'))throw Error('Only loopback development on port 3000 supported.');
 if(e.ENABLE_COVER_LETTER_QUALITY_V2==='true')throw Error('Set ENABLE_COVER_LETTER_QUALITY_V2=false in the private development .env first.');
 for(const key of ['NMP_ENV','PORT','HOST','ENABLE_COVER_LETTER_QUALITY_V2','ENABLE_COVER_LETTER_V2_PRIVATE_REPLAY'])process.env[key]=e[key]||({NMP_ENV:'development',PORT:'3000',HOST:'127.0.0.1'}[key]||'false');
 globalThis.fetch=()=>{throw Error('Network calls are disabled in this local verifier.');};
 const {buildPolishingApiRequest}=await import(pathToFileURL(path.join(root,'src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js')).href);
 const model='openai/gpt-6-luna';
 const request={applicationJobTitle:'Delivery Consultant',jobDescriptionSummary:'Delivery Consultant',jobDescriptionText:'Synthetic delivery and collaboration requirements.',selectedCvText:'Synthetic candidate delivery evidence.',draftPlainText:'Synthetic draft for a LOCAL request-shape check.',candidateDisplayName:'Test Candidate',organisationName:'Test Organisation',organisationUrl:'https://example.invalid',jobAdvertLink:'https://example.invalid/jobs/test',protectOutreachStructure:true,allowUnknownOrganisation:true,letterTone:'professional',letterLengthMode:'standard',maxWords:400,webSearchEnabled:false,selectedCvHighlights:[],companyValues:[],selectedResearchPoints:[],researchSources:[]};
 const api=buildPolishingApiRequest(request,model),userMessage=api.input.find(x=>x.role==='user'),payload=JSON.parse(userMessage.content.find(x=>x.type==='input_text').text),schema=api.response_format.json_schema.schema;
 const result={mode:'quality-first-development',model,requiredV2Audit:schema.required.includes('evidenceAudit'),v2EvidenceContractInRequest:Object.prototype.hasOwnProperty.call(payload,'evidenceContract'),reasoningEffort:api.reasoning?.effort||'not set',outputTokenCap:api.max_output_tokens,providerCallsMade:0,usesSyntheticData:true};
 console.log(JSON.stringify(result,null,2));
 if(result.requiredV2Audit||result.v2EvidenceContractInRequest||result.reasoningEffort!=='low')process.exitCode=1;
}catch(e){console.error('LOCAL VERIFICATION STOPPED: '+e.message);process.exitCode=1;}
