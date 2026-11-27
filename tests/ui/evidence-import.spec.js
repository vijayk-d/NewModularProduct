import {test,expect} from '@playwright/test';import {once} from 'node:events';import {fileURLToPath} from 'node:url';import {createLocalServer} from '../../src/interfaces/http/create-local-server.js';import {createAssignmentEvidenceStore} from '../../src/infrastructure/applications/sqlite-assignment-evidence.js';
// In-memory library; the committed starter pack contains templates only, no personal data.
const PACK=fileURLToPath(new URL('../../docs/evidence/evidence-starter-pack.json',import.meta.url));
let server,store,url;
test.beforeAll(async()=>{store=createAssignmentEvidenceStore({filePath:':memory:'});server=createLocalServer({assignmentEvidenceStore:store});server.listen(0,'127.0.0.1');await once(server,'listening');url='http://127.0.0.1:'+server.address().port;});
test.afterAll(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();});
test('Import evidence file adds the starter pack once, unapproved, and skips it the second time',async({page})=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/evidence-library');await expect(page.locator('#status')).toContainText('loaded');
 const pick=async()=>{const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Import evidence file'}).click();await (await chooser).setFiles(PACK);};
 await pick();await expect(page.locator('#status')).toContainText('Imported 8 assignments with 32 scenarios');
 await expect(page.locator('#progress')).toContainText('8 assignment(s) · 32 scenario(s) · 0 ready for letters');
 await expect(page.locator('#assignments option')).toHaveCount(9);await expect(page.locator('#assignments')).not.toHaveValue('');
 await expect(page.locator('#scenarios option')).toHaveCount(5);
 await pick();await expect(page.locator('#status')).toContainText('Nothing new was imported. Skipped (already in your library)');expect(store.list().items.length).toBe(8);expect(errors).toEqual([]);});
