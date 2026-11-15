import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publishEmailDomain,EMAIL_DOMAIN_STORAGE_KEY} from '../../src/interfaces/http/review-page.js';
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
test('polish approval is shown beside the button, not a browser dialog',async()=>{
 const s=await readFile(new URL('../../src/interfaces/http/polishing-cost-controls.js',import.meta.url),'utf8');
 assert.ok(!s.includes('window.confirm'));assert.ok(s.includes('data-polishing-run-summary'));
});
