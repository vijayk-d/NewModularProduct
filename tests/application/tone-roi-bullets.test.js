import test from 'node:test';
import assert from 'node:assert/strict';
import {LETTER_TONES,letterToneInstruction,EVIDENCE_ROI_POLICY} from '../../src/application/cover-letter-controls.js';
import {QUALITY_V2_INSTRUCTIONS} from '../../src/application/cover-letter-quality-v2.js';
test('every tone keeps ROI-led bullet structure',()=>{
 for(const t of LETTER_TONES){const i=letterToneInstruction(t.value);assert.ok(i.startsWith(t.instruction));assert.ok(i.endsWith(EVIDENCE_ROI_POLICY));}
 assert.match(EVIDENCE_ROI_POLICY,/\u2022/);assert.match(EVIDENCE_ROI_POLICY,/ROI-led/);assert.match(EVIDENCE_ROI_POLICY,/Never invent/);
 assert.equal(letterToneInstruction(),letterToneInstruction('professional'));
 assert.throws(()=>letterToneInstruction('bogus'));
});
test('quality v2 no longer discourages metrics',()=>{assert.doesNotMatch(QUALITY_V2_INSTRUCTIONS,/Do not force a metric/);assert.match(QUALITY_V2_INSTRUCTIONS,/ROI-led/);});
