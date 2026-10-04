import { test, expect } from '@playwright/test';

async function prepareApplication(page, overrides = {}) {
  const values = {
    jobTitle: 'Project Manager',
    recruiterName: 'Hiring Manager',
    jobAdvertLink: 'https://example.com/jobs/project-manager',
    vacancyReference: 'PM-42',
    preferredRoleCodes: 'PM, ADL',
    jobDescriptionText:
      'Project Manager role requiring delivery leadership and stakeholder management.',
    cvHighlights:
      'Led complex delivery programmes\nImproved stakeholder reporting',
    ...overrides
  };

  await page.goto('/');

  await page.getByLabel('Job title').fill(values.jobTitle);
  await page.getByLabel('Recruiter or hiring manager').fill(values.recruiterName);
  await page.getByLabel('Job advert URL').fill(values.jobAdvertLink);
  await page.getByLabel('Vacancy reference').fill(values.vacancyReference);
  await page.getByLabel('Preferred CV role codes').fill(values.preferredRoleCodes);
  await page.getByLabel('Job description').fill(values.jobDescriptionText);
  await page.getByLabel('CV highlights').fill(values.cvHighlights);

  await page.getByRole('button', {
    name: 'Generate application'
  }).click();

  await expect(page).toHaveTitle('Application review');
}

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

test('reviews vacancy details and provides local cover-letter copying', async ({ page }) => {
  await prepareApplication(page);

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
      hasText: 'Recruiter or hiring manager: Hiring Manager'
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

  const draft = page.getByLabel('Generated cover letter');
  await expect(draft).toHaveAttribute('readonly', '');
  await expect(draft).not.toHaveValue('');

  await page.getByRole('button', {
    name: 'Copy cover letter'
  }).click();

  const copyStatus = page.locator('#copy-status');

  await expect(copyStatus).toHaveText(
    /Cover letter copied to clipboard\.|Cover letter selected\. Copy it manually\./
  );

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

test('does not render an unsafe job advert value as a link', async ({ page }) => {
  const unsafeUrl = 'javascript:alert(1)';

  await prepareApplication(page, {
    jobAdvertLink: unsafeUrl
  });

  await expect(
    page.getByRole('link', {
      name: unsafeUrl
    })
  ).toHaveCount(0);

  await expect(page.locator(`a[href="${unsafeUrl}"]`)).toHaveCount(0);

  await expect(
    page.locator('a[href^="javascript:"]')
  ).toHaveCount(0);
});

test('renders markup-like recruiter input as text', async ({ page }) => {
  const hostileRecruiter = '<img src=x onerror=alert(1)>';

  await prepareApplication(page, {
    recruiterName: hostileRecruiter
  });

  await expect(
    page.getByText(`Recruiter or hiring manager: ${hostileRecruiter}`, {
      exact: true
    })
  ).toBeVisible();

  await expect(page.locator('img')).toHaveCount(0);
});

test('falls back to manual copying when clipboard access fails', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error('Clipboard unavailable'))
      }
    });
  });

  await prepareApplication(page);

  const draft = page.getByLabel('Generated cover letter');
  const copyButton = page.getByRole('button', {
    name: 'Copy cover letter'
  });

  await copyButton.focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('#copy-status')).toHaveText(
    'Cover letter selected. Copy it manually.'
  );

  await expect(draft).toBeFocused();
});

