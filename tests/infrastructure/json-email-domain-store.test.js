import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createJsonEmailDomainStore} from '../../src/infrastructure/applications/json-email-domain-store.js';
import {createEmailDomainResolutionService} from '../../src/application/email-domain-resolution-service.js';

function folder(t) { const dir = mkdtempSync(path.join(tmpdir(), 'email-domain-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; }
const clock = () => new Date('2026-11-18T10:00:00.000Z');

test('lookups survive a restart and are written atomically into the state folder', async t => {
  const dir = folder(t), filePath = path.join(dir, 'state', 'email-domain-resolutions-v1.json');
  const store = createJsonEmailDomainStore({filePath, clock});
  assert.equal(await store.get('r1'), null);
  await store.save('r1', {emailDomain: 'example.co.uk', confidence: 'high'});
  const again = createJsonEmailDomainStore({filePath, clock});
  assert.deepEqual(await again.get('r1'), {emailDomain: 'example.co.uk', confidence: 'high', resolvedAt: '2026-11-18T10:00:00.000Z'});
  assert.deepEqual(readdirSync(path.dirname(filePath)), ['email-domain-resolutions-v1.json'], 'no temporary file left behind');
});

test('the old file in the source folder is read once and never changed', async t => {
  const dir = folder(t), legacyPath = path.join(dir, 'data', 'email-domain-resolutions.json'), filePath = path.join(dir, 'state', 'new.json');
  const legacy = JSON.stringify({old: {emailDomain: 'old.example'}});
  await import('node:fs/promises').then(fs => fs.mkdir(path.dirname(legacyPath), {recursive: true}));
  writeFileSync(legacyPath, legacy);
  const store = createJsonEmailDomainStore({filePath, legacyPath, clock});
  assert.equal((await store.get('old')).emailDomain, 'old.example');
  await store.save('new', {emailDomain: 'new.example'});
  assert.equal(readFileSync(legacyPath, 'utf8'), legacy, 'old file unchanged');
  const saved = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['new', 'old'], 'old lookups carried into the new file');
});

test('an unreadable file is never overwritten', async t => {
  const dir = folder(t), filePath = path.join(dir, 'broken.json');
  writeFileSync(filePath, '{ half a file');
  const store = createJsonEmailDomainStore({filePath, clock});
  await assert.rejects(store.save('r1', {emailDomain: 'example.com'}), e => e.code === 'EMAIL_DOMAIN_STORE' && /left unchanged/.test(e.message));
  assert.equal(readFileSync(filePath, 'utf8'), '{ half a file');
});

test('two saves at the same moment keep both results', async t => {
  const dir = folder(t), filePath = path.join(dir, 'state.json');
  const store = createJsonEmailDomainStore({filePath, clock});
  await Promise.all([store.save('a', {emailDomain: 'a.example'}), store.save('b', {emailDomain: 'b.example'})]);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(filePath, 'utf8'))).sort(), ['a', 'b']);
});

test('a relative path is refused, and the service uses the store it is given', async t => {
  assert.throws(() => createJsonEmailDomainStore({filePath: 'data/x.json'}), /absolute/);
  const dir = folder(t), filePath = path.join(dir, 'svc.json');
  const service = createEmailDomainResolutionService({perplexityClient: {}, recruiterContactStore: {}, store: createJsonEmailDomainStore({filePath, clock})});
  assert.equal(await service.getResolution('none'), null);
  assert.equal(existsSync(filePath), false, 'reading never creates the file');
});
