# Tailored CV (CV rebuilding, part 1)

Status: part 1 merged (`feat/cv-tailoring`); employer bullets and chosen headings on branch `fix/cv-tailoring-headings` (17 November 2026). Not released.

## What it does

On the application review page, **Tailored CV** makes a copy of the selected Word CV and changes only:

- **Summary or Profile.** It starts as your current wording; you edit it.
- **Bullets under each employer** (Experience):
  - ranked so the most job-relevant come first;
  - you can edit them, delete a line to leave it out, or use **Back to CV order**;
  - employer lines, titles, dates and the order of employers never change, and a bullet cannot move to another employer.
- **Key achievements section**, only if your CV has one. Bullets come from that section and from the achievements selected for this application.

Unchanged lines keep their original paragraph, so bold lead-ins and highlights survive a reorder. Edited lines take the style of that section's first bullet. Everything else stays as in your CV: name, contact details, Skills, Education, Certifications, References, fonts and layout.

Each build is saved as a new version. You can download it as a DOCX, or include it in the Export pack by choosing **Tailored CV (DOCX)**.

## Rules

- **Free and local.** No Perplexity call, no Gmail action, nothing sent anywhere. The optional paid Polish step is part 2 and not built yet.
- **Original untouched.** Your original CV file is never written. A tailored CV is stored as a new version in `<state folder>/cv-tailoring-v1.db`. No existing database or schema is changed.
- **Evidence only.** Drafts use only lines that already exist in your CV or in this application's selected achievements.
- **Figures checked.** Any figure you type (%, £, numbers) must already appear in that evidence, or the build is refused and the figure is named. A figure in an employer's bullets must come from that same employer's original bullets.
- **Job keywords.** Keywords that have no evidence are shown as gaps and never added.
- **Version pinned.** The build is tied to the Word file that was checked. If the CV changes in between, you are asked to draft again.
- **Export pack.** It includes the tailored CV only if it was built from the CV selected now.

## What your Word CV needs

- **Word copy.** A `.docx` next to the library PDF, with the same name, for example `PM/My_CV.pdf` and `PM/My_CV.docx`. This is the same convention the Export pack uses.
- **Headings.** A Summary or Profile heading, plus an Experience heading with bulleted lines under each employer and/or a Key achievements heading. Recognised names include:
  - **Profile:** Profile, Professional Profile, Personal Profile, Profile Summary, Summary, Professional Summary, Executive Summary, Personal Statement, About me.
  - **Experience:** Experience, Professional Experience, Work Experience, Employment History, Career History, Work History.
  - **Key achievements:** Key Achievements, Achievements, Selected Achievements, Career Highlights, Key Accomplishments, Highlights.
- **Layout.** The section text must follow its heading, in the same column, in the next table cell (two-column CV table) or in the next table row (single-column table). If the layout isn't supported, the page says so and nothing is built.
- **Your own heading names.** If a heading isn't recognised, the page lists the heading-like lines it found in your Word CV (bold, styled, capitals or ending with a colon). Choose which is Profile and which is Key achievements, then **Draft again with these headings**. The choice is remembered per CV in this browser.

## Manual check before release

1. On development, draft and build a tailored CV for one real application.
2. Open the downloaded DOCX in Word. Check that it opens without a repair prompt and that the bullets and fonts match your CV.
3. Export a pack with **Tailored CV (DOCX)**.
