import { prepareApplication } from './prepare-application.js';

function applicationError(message) {
  return new Error(
    `Application preparation from repositories error: ${message}`
  );
}

function requireRepository(repository, name) {
  if (!repository || typeof repository.load !== 'function') {
    throw applicationError(`${name} must provide a load() function.`);
  }

  return repository;
}

function requireTemplateId(templateId) {
  const value = String(templateId || '').trim();

  if (!value) {
    throw applicationError('templateId is required.');
  }

  return value;
}

function normalizeTemplate(template) {
  if (!template || typeof template !== 'object') {
    throw applicationError(
      'template repository returned an invalid template.'
    );
  }

  const id = String(template.id || '').trim();
  const content = String(template.content || '');

  if (!id) {
    throw applicationError(
      'template repository returned a template without an id.'
    );
  }

  if (!content.trim()) {
    throw applicationError(
      'template repository returned an empty template.'
    );
  }

  return {
    id,
    content,
    sourcePath: String(template.sourcePath || '').trim()
  };
}

function normalizeInventory(inventory) {
  if (!inventory || typeof inventory !== 'object') {
    throw applicationError(
      'CV inventory repository returned an invalid inventory.'
    );
  }

  const cvs = inventory.cv_inventory?.cvs || inventory.cvs;

  if (!Array.isArray(cvs)) {
    throw applicationError(
      'CV inventory repository returned no CV array.'
    );
  }

  return inventory;
}

export async function prepareApplicationFromRepositories({
  request = {},
  templateId,
  templateRepository,
  cvInventoryRepository
} = {}) {
  const selectedTemplateId = requireTemplateId(templateId);

  const templates = requireRepository(
    templateRepository,
    'templateRepository'
  );

  const inventories = requireRepository(
    cvInventoryRepository,
    'cvInventoryRepository'
  );

  const [template, inventory] = await Promise.all([
    templates.load(selectedTemplateId),
    inventories.load()
  ]);

  const normalizedTemplate = normalizeTemplate(template);
  const normalizedInventory = normalizeInventory(inventory);

  const prepared = prepareApplication({
    ...request,
    inventory: normalizedInventory,
    coverLetterTemplate: normalizedTemplate.content
  });

  return {
    ...prepared,
    sources: {
      template: {
        id: normalizedTemplate.id,
        sourcePath: normalizedTemplate.sourcePath
      },
      inventory: {
        source: 'repository'
      }
    }
  };
}
