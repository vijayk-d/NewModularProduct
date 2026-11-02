import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const contact={id:'c1',firstName:'Test',lastName:'Person',fullName:'Test Person',selectedEmail:'first@company.test',emailCandidates:['first@company.test','second@company.test'],emailSource:'supplied'};
async function fixture(page){
 const additions=[];
 await page.route('http://127.0.0.1:31299/**',async route=>{
  const url=new URL(route.request().url()),name=url.pathname.slice(1);
  if(name.endsWith('.js')||name.endsWith('.css')){
   const file=name==='outreach-queue.js'?'outreach-queue-browser.js':name;
   await route.fulfill({contentType:name.endsWith('.css')?'text/css':'text/javascript',body:await readFile(path.resolve('src/interfaces/http',file),'utf8')});return;
  }
  let body;
  if(url.pathname==='/api/recruiter-contacts/linking')body={ok:true,linked:[contact],unlinked:[]};
  else if(url.pathname==='/api/outreach-queue/link-and-add'){
   const p=route.request().postDataJSON();additions.push(p);
   body={ok:true,added:p.rows.length,updated:0,duplicates:0,items:p.rows.map((r,i)=>({id:'q'+i,email:r.email,status:'new'}))};
  }else if(url.pathname==='/api/outreach-queue')body={ok:true,items:[]};
  else if(url.pathname==='/api/outreach-queue/send-history')body={ok:true,items:[],total:0,page:1,pages:1};
  else if(url.pathname.startsWith('/api/'))body={ok:true,sendingEnabled:false,draftCreationEnabled:false,configurationReady:false,blockedReasons:[],items:[]};
  else{
   await route.fulfill({contentType:'text/html',body:`<main><section class="review-section">
    <table><thead></thead><tbody class="linked-imported-contacts-body"></tbody></table><div class="linked-contact-actions"></div>
    <form action="/recruiter-contacts/link"><input type="hidden" name="reviewId" value="r1"><table><thead></thead><tbody class="available-imported-contacts-body"></tbody></table><button type="submit">Link selected contacts</button></form>
    <div id="cover-letter-draft" contenteditable="true">Dear Test,<br><br>I led delivery.<br><br>Warm regards,<br>Test Candidate</div><input id="current-cover-letter-subject" value="Application"><input id="email-domain-input" value="company.test">
    </section><section class="organisation-contact-summary"><table><thead></thead><tbody class="organisation-contact-summary-body"></tbody></table></section></main><script type="module" src="/outreach-queue.js"></script>`});return;
  }
  await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://127.0.0.1:31299/');
 await expect(page.locator('.organisation-contact-summary-body tr')).toHaveCount(2);
 return additions;
}
test('email candidates become separate selectable rows and queue exact selected addresses',async({page})=>{
 const additions=await fixture(page);
 const rows=page.locator('.organisation-contact-summary-body tr');
 await expect(rows.nth(0).locator('.candidate-email')).toHaveValue('first@company.test');
 await expect(rows.nth(1).locator('.candidate-email')).toHaveValue('second@company.test');
 await rows.nth(1).locator('[type=checkbox]').check();
 await page.getByRole('button',{name:/^Queue organisation contacts/}).click();
 await expect(page.locator('.organisation-contact-status')).toContainText('1 new;');
 expect(additions[0].rows.map(r=>({contactId:r.contactId,email:r.email}))).toEqual([{contactId:'c1',email:'second@company.test'}]);
 await expect(rows).toHaveCount(2);
 await rows.nth(0).locator('[type=checkbox]').check();
 await rows.nth(1).locator('[type=checkbox]').check();
 await page.getByRole('button',{name:/^Queue organisation contacts/}).click();
 await expect(page.locator('.organisation-contact-status')).toContainText('2 new;');
 expect(additions[1].rows.map(r=>({contactId:r.contactId,email:r.email}))).toEqual([{contactId:'c1',email:'first@company.test'},{contactId:'c1',email:'second@company.test'}]);
});
test('refreshed linked rows split once without accumulating duplicates',async({page})=>{
 await fixture(page);
 for(let i=0;i<2;i++){
  await page.evaluate(async()=>{const {refreshImportedContacts}=await import('/review-page.js');await refreshImportedContacts('r1');});
  for(const selector of ['.linked-imported-contacts-body','.organisation-contact-summary-body']){
   const rows=page.locator(selector+' tr');await expect(rows).toHaveCount(2);
   await expect(rows.nth(0).locator('.candidate-email')).toHaveValue('first@company.test');
   await expect(rows.nth(1).locator('.candidate-email')).toHaveValue('second@company.test');
  }
 }
});
