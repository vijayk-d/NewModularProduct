import { test, expect } from '@playwright/test';

test('shows the application preparation form and manual-send notice', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Application preparation');

  await expect(
    page.getByRole('heading', {
      name: 'Application preparation'
    })
  ).toBeVisible();

  await expect(page.getByLabel('Job title')).toBeVisible();
  await expect(page.getByLabel('Job description')).toBeVisible();

  await expect(
    page.getByRole('button', {
      name: 'Generate application'
    })
  ).toBeEnabled();

  await expect(
    page.getByText(
      'This local tool does not send email. Review and send manually.'
    )
  ).toBeVisible();
});

test('normalizes a LinkedIn company People URL without overwriting user-entered fields', async ({ page }) => {
  await page.goto('/');

  const organisationUrl = page.getByLabel(
    'Organisation website or LinkedIn page'
  );

  await organisationUrl.fill(
    'https://www.linkedin.com/company/leidos/about/?trk=example'
  );
  await organisationUrl.blur();

  await expect(organisationUrl).toHaveValue(
    'https://www.linkedin.com/company/leidos'
  );

  await expect(
    page.getByLabel('Organisation / advertiser name', { exact: true })
  ).toHaveValue('leidos');

  await expect(
    page.getByLabel('Stakeholder source or recruiter page')
  ).toHaveValue(
    'https://www.linkedin.com/company/leidos/people'
  );

  await page.getByLabel('Organisation / advertiser name', { exact: true }).fill('Leidos UK');
  await page.getByLabel('Stakeholder source or recruiter page').fill(
    'Existing recruiter source'
  );

  await organisationUrl.fill(
    'https://www.linkedin.com/company/leidos/about/?trk=updated'
  );
  await organisationUrl.blur();

  await expect(
    page.getByLabel('Organisation / advertiser name', { exact: true })
  ).toHaveValue('Leidos UK');

  await expect(
    page.getByLabel('Stakeholder source or recruiter page')
  ).toHaveValue('Existing recruiter source');
});

test('reviews vacancy details and provides local cover-letter copying', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Job title').fill('Project Manager');
  await page.getByLabel(
    'Stakeholder source or recruiter page'
  ).fill('Hiring Manager');
  await page.getByLabel('Job advert URL').fill(
    'https://example.com/jobs/project-manager'
  );
  await page.getByLabel('Vacancy reference').fill('PM-42');
  await page.getByRole('checkbox', {name:'PM — Project Manager',exact:true}).check();
  await page.getByLabel('Job description').fill(
    'Project Manager role requiring delivery leadership and stakeholder management.'
  );
  await expect(page.locator('#achievement-preparation')).toBeVisible();
  // Empty explicit evidence selections must not invent achievement claims.

  await page.getByRole('button', {
    name: 'Generate application'
  }).click();

  await expect(page).toHaveTitle('Application review');

  await expect(
    page.getByRole('heading', {
      name: 'Application review'
    })
  ).toBeVisible();

  await expect(
    page.getByRole('heading', {
      name: 'Vacancy details'
    })
  ).toBeVisible();

  await expect(
    page.locator('p', {
      hasText: 'Stakeholder source: Hiring Manager'
    })
  ).toBeVisible();

  await expect(
    page.locator('p', {
      hasText: 'Vacancy reference: PM-42'
    })
  ).toBeVisible();

  const advert = page.getByRole('link', {
    name: 'https://example.com/jobs/project-manager'
  });

  await expect(advert).toHaveAttribute(
    'href',
    'https://example.com/jobs/project-manager'
  );
  await expect(advert).toHaveAttribute('target', '_blank');
  await expect(advert).toHaveAttribute(
    'rel',
    'noreferrer noopener'
  );

  const draft = page.getByLabel('Editable current cover letter draft');
  await expect(draft).toHaveAttribute('contenteditable', 'true');
  await expect(draft).not.toHaveText('');

  await page.getByRole('button', {
    name: 'Copy rich text'
  }).click();

  const copyStatus = page.locator('#copy-status');

  await expect(copyStatus).toHaveText(
    /Rich text copied\.|Text selected\. Copy it manually\./
  );

  await expect(
    page.getByText(
      'This local tool does not send email. Review and send manually.'
    )
  ).toBeVisible();

  await expect(
    page.getByRole('link', {
      name: 'New application', exact: true
    })
  ).toBeVisible();
});

test('shows separate rich-text toolbars for current and proposed cover letters', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Job title').fill('Project Manager');
  await page
    .getByLabel('Job description')
    .fill('Lead delivery, stakeholder management, and programme governance.');
  await page.getByRole('button', { name: 'Generate application' }).click();

  const currentToolbar = page.getByRole('toolbar', {
    name: 'Cover letter formatting'
  });

  await expect(currentToolbar).toBeVisible();
  await expect(
    page.getByLabel('Editable current cover letter draft')
  ).toHaveAttribute('contenteditable', 'true');

  // The proposed toolbar must not exist before a proposal is created.
  await expect(
    page.getByRole('toolbar', {
      name: 'Proposed cover letter formatting'
    })
  ).toHaveCount(0);
});




