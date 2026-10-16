import { test,expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
async function fixture(page){
 const writes=[],drafts=[],items=[];let linked=false;
 const contact={id:'c',firstName:'Zoe',lastName:'Jones',fullName:'Zoe Jones',selectedEmail:'zoe.jones@business.test',emailCandidates:['zoe.jones@business.test','jones.zoe@business.test'],emailSource:'inferred'};
 await page.route('http://127.0.0.1:31299/**',async route=>{
  const url=new URL(route.request().url()),name=url.pathname.slice(1);let body;
  if(name.endsWith('.js')||name.endsWith('.css')){await route.fulfill({contentType:name.endsWith('.css')?'text/css':'text/javascript',body:await readFile(path.resolve('src/interfaces/http',name==='outreach-queue.js'?'outreach-queue-browser.js':name),'utf8')});return;}
  if(url.pathname==='/api/recruiter-contacts/linking')body={ok:true,linked:linked?[contact]:[],unlinked:linked?[]:[contact]};
  else if(url.pathname==='/api/outreach-queue/gmail-draft-status')body={ok:true,draftCreationEnabled:true,configurationReady:true,configuredMailbox:'sender@business.test',blockedReasons:[],environment:[]};
  else if(url.pathname==='/api/outreach-queue/gmail-status')body={ok:true,mailboxCheckEnabled:false,configurationReady:false};
  else if(url.pathname==='/api/outreach-queue')body={ok:true,items};
  else if(url.pathname==='/api/outreach-queue/link-and-add'){
   const p=route.request().postDataJSON();writes.push(p);linked=true;
   for(const row of p.rows)items.push({id:'q'+items.length,status:'new',email:row.email,fullName:row.firstName+' '+row.lastName,subject:p.subject,bodyPlainText:p.bodyPlainText,emailSource:'inferred'});
   body={ok:true,added:p.rows.length,updated:0,duplicates:0,items:items.slice(-p.rows.length)};
  }else if(url.pathname==='/api/outreach-queue/draft-one'){
   const p=route.request().postDataJSON();drafts.push(p);items.find(i=>i.id===p.queueId).status='drafted';body={ok:true,created:true,draftId:'test-draft',sendingAccount:'sender@business.test'};
  }else if(url.pathname.startsWith('/api/'))body={ok:true,models:[]};
  else{await route.fulfill({contentType:'text/html',body:`<main><section class="review-section"><table><thead></thead><tbody class="linked-imported-contacts-body"></tbody></table><div class="linked-contact-actions"></div><form action="/recruiter-contacts/link"><input type="hidden" name="reviewId" value="r"><table><thead></thead><tbody class="available-imported-contacts-body"></tbody></table><button type="submit">Link selected contacts</button></form><div id="cover-letter-draft" contenteditable="true">Dear Wrong,<br><br>I led delivery.<br><br>Warm regards,<br>Candidate</div><input id="current-cover-letter-subject" value="Application | Vijay DAFAL"><input id="email-domain-input" value="business.test"></section></main><script type="module" src="/outreach-queue.js"></script>`});return;}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://127.0.0.1:31299/');return {writes,drafts};
}
test('per-address editing and link/queue then direct Draft need no second review',async({page})=>{
 const state=await fixture(page);const rows=page.locator('.available-imported-contacts-body tr');await expect(rows).toHaveCount(2);
 await rows.nth(1).locator('.candidate-first').fill('Zoe');await rows.nth(1).locator('[type=checkbox]').check();
 await page.getByRole('button',{name:/Link and add selected to queue/}).click();
 await expect(page.locator('.simple-contact-status')).toContainText('1 new;');expect(state.writes[0].rows[0].email).toBe('jones.zoe@business.test');
 await expect(page.locator('.outreach-queue-body tr')).toHaveCount(1);await page.getByRole('button',{name:'Draft for Zoe Jones',exact:true}).click();
 await expect(page.locator('.outreach-queue-status')).toContainText('1 draft(s) created');expect(state.drafts).toHaveLength(1);
 await expect(page.locator('.confirmed-gmail-draft-panel')).toBeHidden();
});
test('custom row generates an editable address',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Add contact row'}).click();const row=page.locator('.available-imported-contacts-body tr').last();
 await row.locator('.candidate-first').fill('Alex');await row.locator('.candidate-last').fill('Smith');await row.getByRole('button',{name:'Suggest email (inferred)',exact:true}).click();
 await expect(row.locator('.candidate-email')).toHaveValue('alex.smith@business.test');await expect(row.locator('[type=checkbox]')).toBeChecked();
});
