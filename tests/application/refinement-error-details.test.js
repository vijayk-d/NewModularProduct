import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRefinementFailure, formatRefinementFailure, refinementError } from '../../src/application/refinement-error-details.js';
test('local language rejection is distinguished from provider unavailability',()=>{
  const error=new Error('Provider returned unexpected mixed-language letter or warning text. The proposal was not accepted.');
  assert.equal(describeRefinementFailure(error).errorCode,'REFINEMENT_LANGUAGE_REJECTED');
  assert.match(formatRefinementFailure(error),/mixed-language/);
});
test('HTTP and network failure retain safe status metadata',()=>{
  assert.equal(describeRefinementFailure(refinementError('REFINEMENT_HTTP_FAILED','generic',{httpStatus:429})).httpStatus,429);
  assert.match(formatRefinementFailure(refinementError('REFINEMENT_NETWORK_FAILED','generic',{networkCode:'UND_ERR_HEADERS_TIMEOUT'})),/UND_ERR_HEADERS_TIMEOUT/);
});
test('unknown error content and provider payload messages cannot leak into diagnostics',()=>{
  const error=refinementError('REFINEMENT_HTTP_FAILED','PRIVATE CV TEXT',{httpStatus:400,providerErrorCode:'PRIVATE TEXT WITH SPACES',prompt:'PRIVATE PROMPT',apiKey:'PRIVATE KEY'});
  const output=JSON.stringify(describeRefinementFailure(error))+formatRefinementFailure(error);
  assert.ok(!output.includes('PRIVATE'));
});
test('safe response shape reports metadata only',()=>{
  const error=new Error('Perplexity cover-letter refinement returned no usable draft.');
  error.refinementDetails={httpStatus:200,outputShape:{itemCount:3,textBlocks:1,hasParsed:false}};
  const result=describeRefinementFailure(error);
  assert.equal(result.errorCode,'REFINEMENT_EMPTY_OUTPUT');
  assert.equal(result.outputItemCount,3);
  assert.equal(result.textBlockCount,1);
});
