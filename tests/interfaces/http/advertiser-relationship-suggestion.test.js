import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createLocalServer} from '../../../src/interfaces/http/create-local-server.js';
import {createWorkflowAutomationStore} from '../../../src/infrastructure/applications/sqlite-workflow-automation-store.js';
import {reviewFixture} from '../../fixtures/cv-tailoring-fixtures.js';

async function serve(t, edit, extra = {}) {
  const reviews = reviewFixture();
  const r = reviews.get('r1');
  reviews.set('r1', {...r, formData: {...r.formData, ...edit}});
  const server = createLocalServer({applicationReviewStore: reviews, ...extra, recruiterContactStore: {async listAll() { return []; }, async listByReview() { return []; }}, outreachRepository: {list: () => [], listDraftOperations: () => [], listSendAttempts: () => [], listSentEmails: () => []}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return (await fetch('http://127.0.0.1:' + server.address().port + '/applications/r1')).text();
}
const checked = html => /<input type="radio" name="advertiserRelationship" value="([a-z-]+)" checked>/.exec(html)?.[1];

test('an undecided application preselects a confident suggestion and lists the evidence', async t => {
  const html = await serve(t, {advertiserRelationship: 'unknown', organisationName: 'Example Bank', jobDescriptionText: 'Our client is recruiting on behalf of a leading bank.'});
  assert.equal(checked(html), 'recruitment-intermediary');
  assert.match(html, /data-relationship-source="suggested"/);
  assert.match(html, /Agency: The advert speaks about &quot;our client&quot;/);
});

test('an explicit choice is kept, with a warning when the evidence disagrees', async t => {
  const html = await serve(t, {advertiserRelationship: 'direct-employer', advertiserRelationshipChosen: true, organisationName: 'Example Bank', jobDescriptionText: 'Our client is recruiting on behalf of a leading bank.'});
  assert.equal(checked(html), 'direct-employer');
  assert.match(html, /the evidence points to <strong>Recruitment agency \/ intermediary<\/strong>/);
});

test('a choice remembered for the advertiser is used for the next application', async t => {
  const store = createWorkflowAutomationStore({filePath: ':memory:'});
  store.recordRelationshipChoice('example bank', 'Example Bank', 'direct-employer');
  assert.deepEqual({...store.relationshipChoice('example bank'), chosenAt: 0}, {name: 'Example Bank', relationship: 'direct-employer', chosenAt: 0});
  const html = await serve(t, {advertiserRelationship: 'unknown', organisationName: 'Example Bank', jobDescriptionText: 'Deliver programmes.'},
    {relationshipMemory: {get: key => store.relationshipChoice(key), record: () => {}}});
  assert.equal(checked(html), 'direct-employer');
  assert.match(html, /You chose &quot;Direct employer&quot; for &quot;Example Bank&quot; before/);
});

test('little evidence keeps Unknown and says why', async t => {
  const html = await serve(t, {advertiserRelationship: 'unknown', organisationName: 'Example', jobDescriptionText: 'Deliver programmes.'});
  assert.equal(checked(html), 'unknown');
  assert.match(html, /No evidence about the advertiser was found|not clear enough to preselect/);
});
