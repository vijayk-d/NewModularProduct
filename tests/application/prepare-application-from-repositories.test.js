import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareApplicationFromRepositories } from '../../src/application/prepare-application-from-repositories.js';

const templateContent = `Dear {{firstname}},

I am applying for the {{role}} opportunity.

Key requirements: {{jdKeywords}}.

{{evidence}}

LinkedIn: <a href="{{jobAdvertLink}}" target="_blank" rel="noreferrer">Job advert</a>

Warm regards,
{{recipient}}`;

function createTemplateRepository() {
  return {
    async load(templateId) {
      return {
        id: templateId,
        content: templateContent,
        sourcePath: `D:/templates/${templateId}.md`
      };
    }
  };
}

function createInventoryRepository() {
  return {
    async load() {
      return {
        cv_inventory: {
          cvs: [
            {
              role_code: 'RTE',
              role_name: 'Release Train Engineer',
              local_path: 'D:\\CVs\\RTE.pdf',
              tags: ['safe', 'pi-planning', 'cloud'],
              use_cases: ['SAFe ART facilitation'],
              priority: 'very-high'
            },
            {
              role_code: 'PM',
              role_name: 'Project Manager',
              local_path: 'D:\\CVs\\PM.pdf',
              tags: ['waterfall'],
              use_cases: ['PMO reporting'],
              priority: 'medium'
            }
          ]
        }
      };
    }
  };
}

function createRequest() {
  return {
    jobDescriptionText: [
      'Release Train Engineer',
      'SAFe PI Planning and cloud transformation in London.'
    ].join('\n'),
    selectedCvPaths: [
      'D:\\CVs\\PM.pdf',
      'D:\\CVs\\RTE.pdf'
    ],
    preferredRoleCodes: ['RTE', 'PM'],
    candidateProfile: {
      displayName: 'Test Candidate'
    },
    recruiterName: 'James',
    jobAdvertLink: 'https://example.test/jobs/rte-1'
  };
}

test('prepares an application from repository-loaded template and inventory data', async () => {
  const result = await prepareApplicationFromRepositories({
    request: createRequest(),
    templateId: 'standard-cover-letter',
    templateRepository: createTemplateRepository(),
    cvInventoryRepository: createInventoryRepository()
  });

  assert.equal(result.recommendation.bestCv.role_code, 'RTE');
  assert.equal(result.recommendation.alternativeCv.role_code, 'PM');
  assert.match(result.coverLetter.plainText, /Dear James,/);
  assert.equal(result.coverLetter.validation.valid, true);

  assert.deepEqual(result.sources, {
    template: {
      id: 'standard-cover-letter',
      sourcePath: 'D:/templates/standard-cover-letter.md'
    },
    inventory: {
      source: 'repository'
    }
  });
});

test('loads the requested template ID and inventory once', async () => {
  let loadedTemplateId = '';
  let templateLoads = 0;
  let inventoryLoads = 0;

  const result = await prepareApplicationFromRepositories({
    request: createRequest(),
    templateId: 'focused-template',
    templateRepository: {
      async load(templateId) {
        templateLoads += 1;
        loadedTemplateId = templateId;

        return {
          id: templateId,
          content: templateContent,
          sourcePath: ''
        };
      }
    },
    cvInventoryRepository: {
      async load() {
        inventoryLoads += 1;

        return {
          cvs: [
            {
              role_code: 'RTE',
              role_name: 'Release Train Engineer',
              tags: ['safe'],
              use_cases: [],
              priority: 'high'
            }
          ]
        };
      }
    }
  });

  assert.equal(loadedTemplateId, 'focused-template');
  assert.equal(templateLoads, 1);
  assert.equal(inventoryLoads, 1);
  assert.equal(result.sources.template.id, 'focused-template');
  assert.equal(result.recommendation.bestCv.role_code, 'RTE');
});

test('validates required repositories and returned data', async () => {
  await assert.rejects(
    () => prepareApplicationFromRepositories({
      templateId: 'standard-cover-letter',
      cvInventoryRepository: createInventoryRepository()
    }),
    {
      message:
        'Application preparation from repositories error: templateRepository must provide a load() function.'
    }
  );

  await assert.rejects(
    () => prepareApplicationFromRepositories({
      templateId: 'standard-cover-letter',
      templateRepository: createTemplateRepository()
    }),
    {
      message:
        'Application preparation from repositories error: cvInventoryRepository must provide a load() function.'
    }
  );

  await assert.rejects(
    () => prepareApplicationFromRepositories({
      templateId: 'standard-cover-letter',
      templateRepository: {
        async load() {
          return {
            id: 'standard-cover-letter',
            content: ''
          };
        }
      },
      cvInventoryRepository: createInventoryRepository()
    }),
    {
      message:
        'Application preparation from repositories error: template repository returned an empty template.'
    }
  );
});
