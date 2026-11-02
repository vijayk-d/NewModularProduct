import test from 'node:test';import assert from 'node:assert/strict';import {renderCoverLetterPdf,safeEnvironment} from '../../src/infrastructure/documents/cover-letter-pdf.js';
const layout={html:'<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src none"><p>Fixture</p>',layout:{pageWidthPt:612,pageHeightPt:792}};
function fixture({pdf=Buffer.from('%PDF-fake'),throwPdf=false}={}){
 const seen={closed:0};
 const page={setDefaultTimeout(){},async setContent(h){seen.html=h;},async evaluate(){},async pdf(options){seen.pdfOptions=options;if(throwPdf)throw Error('fake failure');return pdf;}};
 const context={async route(pattern,handler){seen.pattern=pattern;handler({abort(){seen.aborted=true;}});},async newPage(){return page;}};
 const browser={version(){return 'fake-browser';},async close(){seen.closed++;},async newContext(options){seen.context=options;return context;}};
 const detect=()=>({available:true,engine:'fake',executablePath:'/fake',chromium:{async launch(options){seen.launch=options;return browser;}}});
 return {seen,options:{detect,layoutWorker:async()=>layout,env:{PATH:'fixture-path',PERPLEXITY_API_KEY:'not-real',GMAIL_OAUTH_CLIENT_SECRET:'not-real'}}};
}
test('PDF is returned with print background, CSS page geometry and no header/footer',async()=>{const f=fixture(),r=await renderCoverLetterPdf(Buffer.from('PKfixture'),f.options);assert.equal(r.engine,'fake');assert.ok(r.bytes.subarray(0,5).equals(Buffer.from('%PDF-')));assert.equal(f.seen.pdfOptions.preferCSSPageSize,true);assert.equal(f.seen.pdfOptions.printBackground,true);assert.equal(f.seen.pdfOptions.displayHeaderFooter,false);assert.ok(f.seen.closed>0);});
test('page network is aborted and credentials are not inherited',async()=>{const f=fixture();await renderCoverLetterPdf(Buffer.from('PKfixture'),f.options);assert.equal(f.seen.pattern,'**/*');assert.equal(f.seen.aborted,true);assert.equal(f.seen.context.serviceWorkers,'block');assert.equal(f.seen.launch.env.PERPLEXITY_API_KEY,undefined);assert.equal(f.seen.launch.env.GMAIL_OAUTH_CLIENT_SECRET,undefined);});
test('missing engine fails before rendering, without a substitute',async()=>{let called=false;await assert.rejects(()=>renderCoverLetterPdf(Buffer.from('PK'),{detect:()=>({available:false,code:'PDF_BROWSER_MISSING',message:'Missing'}),layoutWorker:async()=>{called=true;}}),{code:'PDF_BROWSER_MISSING'});assert.equal(called,false);});
test('invalid PDF bytes fail and browser closes',async()=>{const f=fixture({pdf:Buffer.from('invalid')});await assert.rejects(()=>renderCoverLetterPdf(Buffer.from('PKfixture'),f.options),{code:'PDF_OUTPUT_INVALID'});assert.ok(f.seen.closed>0);});
test('render failure closes browser and does not silently fall back',async()=>{const f=fixture({throwPdf:true});await assert.rejects(()=>renderCoverLetterPdf(Buffer.from('PKfixture'),f.options),{code:'PDF_RENDER_FAILED'});assert.ok(f.seen.closed>0);});
test('environment filter keeps OS paths but excludes mail/provider flags',()=>{const e=safeEnvironment({PATH:'fixture',ENABLE_GMAIL:'true',GMAIL_OAUTH_REFRESH_TOKEN:'not-real',NMP_ENV:'production'});assert.deepEqual(e,{PATH:'fixture'});});
