import test from 'node:test';
import assert from 'node:assert/strict';
import { fillTemplate } from '../../../src/domain/cover-letter/fill-template.js';

test('fills named tokens and replaces missing values with empty text', () => {
  const result = fillTemplate(
    'Dear {{ firstname }}, applying for {{role}}. {{unknown}}',
    {
      firstname: 'James',
      role: 'Scrum Master'
    }
  );

  assert.equal(
    result,
    'Dear James, applying for Scrum Master. '
  );
});
