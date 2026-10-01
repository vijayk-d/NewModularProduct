import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileTemplateRepository } from '../../../src/infrastructure/templates/file-template-repository.js';

async function createTemplateDirectory() {
  const root = await mkdtemp(join(tmpdir(), 'new-modular-product-'));
  const templates = join(root, 'templates');

  await mkdir(templates);

  return templates;
}

test('loads a Markdown template from the configured directory', async () => {
  const templateDirectory = await createTemplateDirectory();
  const sourcePath = join(templateDirectory, 'standard-cover-letter.md');

  await writeFile(
    sourcePath,
    'Dear {{firstname}},\\n\\n{{evidence}}',
    'utf8'
  );

  const repository = createFileTemplateRepository({
    templateDirectory
  });

  const template = await repository.load('standard-cover-letter');

  assert.deepEqual(template, {
    id: 'standard-cover-letter',
    content: 'Dear {{firstname}},\\n\\n{{evidence}}',
    sourcePath
  });
});

test('supports template IDs with underscores and digits', async () => {
  const templateDirectory = await createTemplateDirectory();

  await writeFile(
    join(templateDirectory, 'cover_letter_v2.md'),
    'Template v2',
    'utf8'
  );

  const repository = createFileTemplateRepository({
    templateDirectory
  });

  const template = await repository.load('cover_letter_v2');

  assert.equal(template.id, 'cover_letter_v2');
  assert.equal(template.content, 'Template v2');
});

test('requires an explicit template directory', () => {
  assert.throws(
    () => createFileTemplateRepository(),
    {
      message:
        'Template repository error: templateDirectory is required.'
    }
  );
});

test('rejects invalid template IDs before filesystem access', async () => {
  const templateDirectory = await createTemplateDirectory();

  const repository = createFileTemplateRepository({
    templateDirectory
  });

  const invalidIds = [
    '',
    '   ',
    '../outside',
    'folder/template',
    'folder\\template',
    'template.md',
    'template name',
    '/absolute-template'
  ];

  for (const templateId of invalidIds) {
    await assert.rejects(
      () => repository.load(templateId),
      /Template repository error:/
    );
  }
});

test('returns a clear error for missing templates', async () => {
  const templateDirectory = await createTemplateDirectory();

  const repository = createFileTemplateRepository({
    templateDirectory
  });

  await assert.rejects(
    () => repository.load('missing-template'),
    {
      message:
        'Template repository error: template "missing-template" was not found.'
    }
  );
});
