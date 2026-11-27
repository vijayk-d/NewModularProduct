import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeEvidenceImport, readyForLetters} from '../../src/application/assignment-evidence-library.js';
import {createAssignmentEvidenceStore} from '../../src/infrastructure/applications/sqlite-assignment-evidence.js';

// Synthetic records only; in-memory database.
const file = (assignments) => ({format: 'jobapp-evidence-v1', assignments});
const scenario = {title: 'Rescue', situation: 'A release slipped.', actions: 'I re-planned it.', outcomes: 'It went live.', approvedWording: 'I brought a slipping release back under control.'};

test('the starter pack file imports 8 role assignments with 4 scenarios each, none ready for letters', () => {
  const pack = JSON.parse(readFileSync(new URL('../../docs/evidence/evidence-starter-pack.json', import.meta.url), 'utf8'));
  const store = createAssignmentEvidenceStore({filePath: ':memory:'});
  try {
    const r = store.importRecords(pack);
    assert.equal(r.added.length, 8);
    assert.equal(r.scenarios, 32);
    assert.ok(r.added.every(a => a.scenarios === 4));
    const list = store.list();
    assert.equal(list.items.length, 8);
    assert.ok(list.items.every(i => i.scenarioCount === 4 && i.readyCount === 0));
    const one = store.get(r.added[0].id);
    assert.ok(one.scenarios.every(s => s.data.evidenceState === 'needs-clarification' && s.data.approved === false && s.approvalCurrent));
    assert.equal(store.versions({kind: 'scenario', id: one.scenarios[0].id}).length, 1, 'each imported record has a saved version');
    const again = store.importRecords(pack);
    assert.equal(again.added.length, 0, 'importing twice adds nothing');
    assert.equal(again.skipped.length, 8);
    assert.equal(store.list().items.length, 8);
  } finally { store.close(); }
});

test('imported scenarios are never approved, even if the file says so; they become ready only through a normal save', () => {
  const [rec] = normalizeEvidenceImport(file([{title: 'A', role: 'Delivery Manager', scenarios: [{...scenario, evidenceState: 'user-confirmed', approved: true}]}]));
  assert.equal(rec.scenarios[0].approved, false);
  assert.equal(readyForLetters(rec.scenarios[0]), false);
  const store = createAssignmentEvidenceStore({filePath: ':memory:'});
  try {
    const {added} = store.importRecords(file([{title: 'A', scenarios: [scenario]}]));
    const a = store.get(added[0].id), s = a.scenarios[0];
    store.save({kind: 'scenario', id: s.id, assignmentId: a.id, expectedRevision: 1, expectedAssignmentRevision: a.revision, data: {...s.data, evidenceState: 'user-confirmed', confirmation: 'My own experience.', approved: true}});
    assert.equal(store.list().items[0].readyCount, 1);
  } finally { store.close(); }
});

test('a bad file imports nothing at all and changes nothing', () => {
  assert.throws(() => normalizeEvidenceImport({assignments: []}), /Not a JobApp evidence file/);
  assert.throws(() => normalizeEvidenceImport(file([])), /no assignments/);
  assert.throws(() => normalizeEvidenceImport(file([{title: 'A', unknown: 'x'}])), /Assignment 1: Unexpected record field/);
  assert.throws(() => normalizeEvidenceImport(file([{title: 'A', scenarios: [{situation: 'no title'}]}])), /scenario 1: A title is required/);
  assert.throws(() => normalizeEvidenceImport(file([{title: 'A', scenarios: Array(21).fill(scenario)}])), /at most 20/);
  const store = createAssignmentEvidenceStore({filePath: ':memory:'});
  try {
    store.save({kind: 'assignment', id: 'keep', expectedRevision: 0, data: {title: 'Mine'}});
    const before = store.list().libraryRevision;
    assert.throws(() => store.importRecords(file([{title: 'Good', scenarios: [scenario]}, {title: 'Bad', scenarios: [{title: ''}]}])), /Assignment 2/);
    assert.equal(store.list().items.length, 1, 'the good assignment was not half-imported');
    assert.equal(store.list().libraryRevision, before);
    assert.equal(store.importRecords(file([{title: 'mine ', scenarios: [scenario]}])).skipped[0], 'mine', 'an existing title is skipped, never overwritten');
    assert.equal(store.get('keep').revision, 1);
  } finally { store.close(); }
});
