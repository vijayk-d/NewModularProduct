import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCvsByPath } from '../../src/domain/cv/select-cvs-by-path.js';

test('returns the original inventory when no paths are selected', () => {
  const inventory = {
    cv_inventory: {
      cvs: [{ role_code: 'ADL' }]
    }
  };

  const result = selectCvsByPath(inventory, []);

  assert.strictEqual(result, inventory);
});

test('limits an inventory to selected existing CV paths in selection order', () => {
  const agileDeliveryLead = {
    role_code: 'ADL',
    role_name: 'Agile Delivery Lead',
    local_path: 'D:\\OneDrive\\ADL.pdf',
    tags: ['agile'],
    use_cases: [],
    priority: 'high'
  };

  const projectManager = {
    role_code: 'PM',
    role_name: 'Project Manager',
    local_path: 'D:\\OneDrive\\PM.pdf',
    tags: ['project'],
    use_cases: [],
    priority: 'medium'
  };

  const inventory = {
    cv_inventory: {
      source: 'synthetic-fixture',
      cvs: [agileDeliveryLead, projectManager]
    }
  };

  const result = selectCvsByPath(inventory, [
    'D:\\OneDrive\\PM.pdf',
    'D:\\OneDrive\\ADL.pdf'
  ]);

  assert.deepEqual(
    result.cv_inventory.cvs.map((cv) => cv.role_code),
    ['PM', 'ADL']
  );

  assert.strictEqual(result.cv_inventory.cvs[0], projectManager);
  assert.strictEqual(result.cv_inventory.cvs[1], agileDeliveryLead);
  assert.equal(result.cv_inventory.source, 'synthetic-fixture');
  assert.notStrictEqual(result, inventory);
  assert.notStrictEqual(result.cv_inventory, inventory.cv_inventory);
});

test('creates analyzable metadata for selected CV paths absent from inventory', () => {
  const result = selectCvsByPath(
    { cv_inventory: { cvs: [] } },
    [
      'D:\\CV\\ADL\\Candidate.pdf',
      'D:\\CV\\Agile PM\\Candidate_PM.pdf'
    ]
  );

  assert.deepEqual(
    result.cv_inventory.cvs.map((cv) => cv.role_code),
    ['CUSTOM-1', 'CUSTOM-2']
  );

  assert.equal(result.cv_inventory.cvs[0].role_name, 'ADL Candidate');
  assert.equal(result.cv_inventory.cvs[1].role_name, 'Agile PM Candidate PM');
  assert.equal(result.cv_inventory.cvs[1].filename, 'Candidate_PM.pdf');
  assert.equal(result.cv_inventory.cvs[1].folder, 'Agile PM');
  assert.deepEqual(
    result.cv_inventory.cvs[1].tags,
    ['agile', 'candidate']
  );
  assert.deepEqual(result.cv_inventory.cvs[1].use_cases, []);
  assert.equal(result.cv_inventory.cvs[1].priority, 'medium');
  assert.equal(result.cv_inventory.cvs[1].recency, '');
});

test('supports inventories with a direct cvs property', () => {
  const result = selectCvsByPath(
    {
      cvs: [
        {
          role_code: 'PM',
          local_path: 'D:\\OneDrive\\PM.pdf'
        }
      ]
    },
    ['D:\\OneDrive\\PM.pdf']
  );

  assert.deepEqual(
    result.cv_inventory.cvs.map((cv) => cv.role_code),
    ['PM']
  );
});

test('does not deduplicate repeated selected paths', () => {
  const projectManager = {
    role_code: 'PM',
    local_path: 'D:\\OneDrive\\PM.pdf'
  };

  const result = selectCvsByPath(
    { cv_inventory: { cvs: [projectManager] } },
    [
      'D:\\OneDrive\\PM.pdf',
      'D:\\OneDrive\\PM.pdf'
    ]
  );

  assert.equal(result.cv_inventory.cvs.length, 2);
  assert.strictEqual(result.cv_inventory.cvs[0], projectManager);
  assert.strictEqual(result.cv_inventory.cvs[1], projectManager);
});
