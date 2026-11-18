import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publishEmailDomain,EMAIL_DOMAIN_STORAGE_KEY,openSearchTabsStep} from '../../src/interfaces/http/review-page.js';
import {scenarioCatalogue} from '../../src/application/scenario-polishing.js';
test('saved email domain is published for the contact bridge',()=>{
 const m=new Map(),storage={setItem:(k,v)=>m.set(k,v)};
 publishEmailDomain(' Version1.com ',storage,null);
 const v=JSON.parse(m.get(EMAIL_DOMAIN_STORAGE_KEY));assert.equal(v.domain,'version1.com');assert.ok(v.savedAt);
 publishEmailDomain('',storage,null);assert.equal(m.size,1);
});
test('catalogue reports whether a scenario selection was ever saved',()=>{
 assert.equal(scenarioCatalogue(null,{}).selectionSaved,false);
 assert.equal(scenarioCatalogue(null,{polishingScenarios:{references:[]}}).selectionSaved,true);
});
test('bridge reuses the stored domain and remembers destination',async()=>{
 const s=await readFile(new URL('../../tampermonkey/Clean-LinkedIn-Contact-Bridge-v0.6.0-dual-port.user.js',import.meta.url),'utf8');
 for(const x of ['@grant        GM_getValue','@grant        GM_setValue','@match        http://127.0.0.1:3100/*','nmp.lastSavedEmailDomain','GM_getValue("destination","both")','beginImport(true)'])assert.ok(s.includes(x),x);
});
test('bridge sends selected destinations straight from the review panel, without a dialog',async()=>{
 const s=await readFile(new URL('../../tampermonkey/Clean-LinkedIn-Contact-Bridge-v0.6.0-dual-port.user.js',import.meta.url),'utf8');
 assert.ok(!s.includes('window.confirm'),'no confirmation dialog before sending');
 const send=s.slice(s.indexOf('action("Send / retry selected destinations"'),s.indexOf('action("New extraction / domain"'));
 assert.ok(send.includes('await deliverContacts(transaction,targets,render)'));
 assert.ok(send.includes('status.textContent=`Sending ${transaction.contactCount}'),'what is being sent is shown in the panel');
 assert.match(s,/@version\s+0\.6\.1/);
});
test('polish approval is shown beside the button, not a browser dialog',async()=>{
 const s=await readFile(new URL('../../src/interfaces/http/polishing-cost-controls.js',import.meta.url),'utf8');
 assert.ok(!s.includes('window.confirm'));assert.ok(s.includes('data-polishing-run-summary'));
});

test('search tab button opens all tabs, or continues one per click when pop-ups are blocked', () => {
  const mk = () => ({ textContent: 'Company People tab', dataset: { openSearchTabs: JSON.stringify(['u1','u2','u3','u4']), openSearchTabLabels: JSON.stringify(['Directors','Heads of function','Talent','Recruiters']), openSearchTabsTitle: 'Company People tab' } });
  const all = mk(); const opened = [];
  assert.equal(openSearchTabsStep(all, u => (opened.push(u), {})).remaining, 0);
  assert.deepEqual(opened, ['u1','u2','u3','u4']);
  const blocked = mk(); const seen = [];
  const oneAllowed = () => { let used = false; return u => { if (used) return null; used = true; seen.push(u); return {}; }; };
  let r = openSearchTabsStep(blocked, oneAllowed());
  assert.equal(r.remaining, 3); assert.match(blocked.textContent, /Heads of function \(2 of 4\)/);
  openSearchTabsStep(blocked, oneAllowed()); openSearchTabsStep(blocked, oneAllowed());
  r = openSearchTabsStep(blocked, oneAllowed());
  assert.equal(r.remaining, 0); assert.deepEqual(seen, ['u1','u2','u3','u4']); assert.equal(blocked.textContent, 'Company People tab');
});
