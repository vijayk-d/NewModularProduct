import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonCvInventoryRepository } from '../../../src/infrastructure/cv-inventory/json-cv-inventory-repository.js';

async function writeInventory(value) {
  const directory = await mkdtemp(
    join(tmpdir(), 'new-modular-product-inventory-')
  );

  const inventoryPath = join(directory, 'cv-inventory.json');

  await writeFile(
    inventoryPath,
    typeof value === 'string' ? value : JSON.stringify(value),
    'utf8'
  );

  return inventoryPath;
}

const specialistCv = {
  role_code: 'RTE',
  role_name: 'Release Train Engineer',
  local_path: 'D:\\CVs\\RTE.pdf',
  tags: ['safe', 'pi-planning'],
  use_cases: ['SAFe ART facilitation'],
  priority: 'very-high'
};

test('loads and normalizes the nested legacy inventory shape', async () => {
  const inventoryPath = await writeInventory({
    cv_inventory: {
      cvs: [specialistCv]
    }
  });

  const repository = createJsonCvInventoryRepository({
    inventoryPath
  });

  const inventory = await repository.load();

  assert.deepEqual(inventory, {
    cv_inventory: {
      cvs: [specialistCv]
    }
  });
});

test('loads and normalizes the direct cvs shape', async () => {
  const inventoryPath = await writeInventory({
    cvs: [specialistCv]
  });

  const repository = createJsonCvInventoryRepository({
    inventoryPath
  });

  const inventory = await repository.load();

  assert.equal(inventory.cv_inventory.cvs.length, 1);
  assert.equal(
    inventory.cv_inventory.cvs[0].role_code,
    'RTE'
  );
});

test('defaults optional arrays and priority', async () => {
  const inventoryPath = await writeInventory({
    cvs: [
      {
        role_code: 'PM',
        role_name: 'Project Manager'
      }
    ]
  });

  const repository = createJsonCvInventoryRepository({
    inventoryPath
  });

  const inventory = await repository.load();

  assert.deepEqual(inventory.cv_inventory.cvs[0], {
    role_code: 'PM',
    role_name: 'Project Manager',
    local_path: '',
    tags: [],
    use_cases: [],
    priority: 'medium'
  });
});

test('requires an inventory path', () => {
  assert.throws(
    () => createJsonCvInventoryRepository(),
    {
      message:
        'CV inventory repository error: inventoryPath is required.'
    }
  );
});

test('reports a missing inventory file', async () => {
  const repository = createJsonCvInventoryRepository({
    inventoryPath: join(tmpdir(), 'missing-cv-inventory.json')
  });

  await assert.rejects(
    () => repository.load(),
    {
      message:
        'CV inventory repository error: inventory file was not found.'
    }
  );
});

test('reports invalid JSON', async () => {
  const inventoryPath = await writeInventory('{ invalid json');

  const repository = createJsonCvInventoryRepository({
    inventoryPath
  });

  await assert.rejects(
    () => repository.load(),
    {
      message:
        'CV inventory repository error: inventory file contains invalid JSON.'
    }
  );
});

test('rejects missing CV arrays', async () => {
  const inventoryPath = await writeInventory({
    cv_inventory: {}
  });

  const repository = createJsonCvInventoryRepository({
    inventoryPath
  });

  await assert.rejects(
    () => repository.load(),
    {
      message:
        'CV inventory repository error: inventory must contain cv_inventory.cvs or cvs as an array.'
    }
  );
});

test('rejects invalid candidate entries', async () => {
  const inventoryPath = await writeInventory({
    cvs: [
      {
        role_code: 'RTE'
      }
    ]
  });

  const repository = createJsonCvInventoryRepository({
    inventoryPath
  });

  await assert.rejects(
    () => repository.load(),
    {
      message:
        'CV inventory repository error: CV entry at index 0 requires a non-empty role_name.'
    }
  );
});

test('rejects duplicate role codes', async () => {
  const inventoryPath = await writeInventory({
    cvs: [
      specialistCv,
      {
        ...specialistCv,
        role_name: 'Duplicate RTE'
      }
    ]
  });

  const repository = createJsonCvInventoryRepository({
    inventoryPath
  });

  await assert.rejects(
    () => repository.load(),
    {
      message:
        'CV inventory repository error: duplicate role_code "RTE".'
    }
  );
});

test('returns fresh inventory objects on each load', async () => {
  const inventoryPath = await writeInventory({
    cvs: [specialistCv]
  });

  const repository = createJsonCvInventoryRepository({
    inventoryPath
  });

  const first = await repository.load();
  const second = await repository.load();

  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.cv_inventory, second.cv_inventory);
  assert.notStrictEqual(
    first.cv_inventory.cvs,
    second.cv_inventory.cvs
  );
  assert.notStrictEqual(
    first.cv_inventory.cvs[0],
    second.cv_inventory.cvs[0]
  );
});
