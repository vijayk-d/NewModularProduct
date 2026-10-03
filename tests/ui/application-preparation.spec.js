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
      name: 'Generate application (coming next)'
    })
  ).toBeDisabled();

  await expect(
    page.getByText(
      'This local tool does not send email. Review and send manually.'
    )
  ).toBeVisible();
});

test('accepts vacancy details in the local application form', async ({ page }) => {
  await page.goto('/');

  const jobTitle = page.getByLabel('Job title');
  const recruiterName = page.getByLabel('Recruiter or hiring manager');
  const jobAdvertLink = page.getByLabel('Job advert URL');
  const jobDescription = page.getByLabel('Job description');

  await jobTitle.fill('Project Manager');
  await recruiterName.fill('Hiring Manager');
  await jobAdvertLink.fill('https://example.com/jobs/project-manager');
  await jobDescription.fill(
    'Project Manager role requiring delivery leadership and stakeholder management.'
  );

  await expect(jobTitle).toHaveValue('Project Manager');
  await expect(recruiterName).toHaveValue('Hiring Manager');
  await expect(jobAdvertLink).toHaveValue(
    'https://example.com/jobs/project-manager'
  );
  await expect(jobDescription).toHaveValue(
    'Project Manager role requiring delivery leadership and stakeholder management.'
  );

  await expect(
    page.getByRole('button', {
      name: 'Generate application (coming next)'
    })
  ).toBeDisabled();

  await expect(
    page.getByText(
      'This local tool does not send email. Review and send manually.'
    )
  ).toBeVisible();
});
