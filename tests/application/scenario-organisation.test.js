import test from 'node:test';import assert from 'node:assert/strict';
import {approvedScenarioRequest,normalizeApprovedScenarioEvidence} from '../../src/application/scenario-polishing.js';
test('selected scenario carries its organisation to polishing without changing approval snapshot',()=>{
 const snap={scenarioId:'s1',approvedWording:'I centralised delivery reporting.',evidenceState:'user-confirmed'};
 const r=approvedScenarioRequest({snapshots:[snap],organisations:['LEXISNEXIS RISK SOLUTIONS']});
 assert.deepEqual(r.approvedScenarioEvidence,[{id:'s1',approvedWording:'I centralised delivery reporting.',evidenceState:'user-confirmed',organisation:'LEXISNEXIS RISK SOLUTIONS'}]);
 assert.deepEqual(Object.keys(snap).sort(),['approvedWording','evidenceState','scenarioId']);
 assert.equal(normalizeApprovedScenarioEvidence([{id:'s2',approvedWording:'x',evidenceState:'user-confirmed'}])[0].organisation,undefined);
});
