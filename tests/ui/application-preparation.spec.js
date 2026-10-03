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

test('submits vacancy details and shows a local application review', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Job title').fill('Project Manager');
  await page.getByLabel('Recruiter or hiring manager').fill(
    'Hiring Manager'
  );
  await page.getByLabel('Job advert URL').fill(
    'https://example.com/jobs/project-manager'
  );
  await page.getByLabel('Vacancy reference').fill('PM-42');
  await page.getByLabel('Preferred CV role codes').fill('PM, ADL');
  await page.getByLabel('Job description').fill(
    'Project Manager role requiring delivery leadership and stakeholder management.'
  );
  await page.getByLabel('CV highlights').fill(
    'Led complex delivery programmes\nImproved stakeholder reporting'
  );

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
      name: 'Recommendation'
    })
  ).toBeVisible();

  await expect(
    page.getByText('Cover letter draft', {
      exact: true
    })
  ).toBeVisible();

  await expect(
    page.getByText(
      'This local tool does not send email. Review and send manually.'
    )
  ).toBeVisible();

  await expect(
    page.getByRole('link', {
      name: 'Prepare another application'
    })
  ).toBeVisible();
});
