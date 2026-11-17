# Tailored CV (CV rebuilding, part 1)

Status: DEVELOPMENT CANDIDATE on branch `feat/cv-tailoring` (17 November 2026). Not released.

## What it does

On the application review page, **Tailored CV** makes a copy of the selected Word CV with only two sections changed:

- **Profile.** It starts as your current profile; you edit it.
- **Key achievements.** Bullets are chosen and ordered by relevance to the job.
  - They come from your CV's achievements and the achievements selected for this application.
  - Lines that weren't chosen are listed so you can add them.

Everything else stays as in your CV: name, contact details, employment history, dates, titles, skills, qualifications, fonts and layout. New bullets copy the style and list numbering of your first existing bullet.

Each build is saved as a new version. You can download it as a DOCX, or include it in the Export pack by choosing **Tailored CV (DOCX)**.

## Rules

- **Free and local.** No Perplexity call, no Gmail action, nothing sent anywhere. The optional paid Polish step is part 2 and not built yet.
- **Original untouched.** Your original CV file is never written. A tailored CV is stored as a new version in `<state folder>/cv-tailoring-v1.db`. No existing database or schema is changed.
- **Evidence only.** Drafts use only lines that already exist in your CV or in this application's selected achievements.
- **Figures checked.** Any figure you type (%, £, numbers) must already appear in that evidence, or the build is refused and the figure is named.
- **Job keywords.** Keywords that have no evidence are shown as gaps and never added.
- **Version pinned.** The build is tied to the Word file that was checked. If the CV changes in between, you are asked to draft again.
- **Export pack.** It includes the tailored CV only if it was built from the CV selected now.

## What your Word CV needs

- **Word copy.** A `.docx` next to the library PDF, with the same name, for example `PM/My_CV.pdf` and `PM/My_CV.docx`. This is the same convention the Export pack uses.
- **Headings.** A Profile heading and a Key achievements heading. Recognised names include:
  - **Profile:** Profile, Professional Profile, Personal Profile, Profile Summary, Summary, Professional Summary, Executive Summary, Personal Statement, About me.
  - **Key achievements:** Key Achievements, Achievements, Selected Achievements, Career Highlights, Key Accomplishments, Highlights.
- **Layout.** The section text must follow its heading, either in the same column or in the next table cell (a two-column CV table). If the layout isn't supported, the page says so and nothing is built.

## Manual check before release

1. On development, draft and build a tailored CV for one real application.
2. Open the downloaded DOCX in Word. Check that it opens without a repair prompt and that the bullets and fonts match your CV.
3. Export a pack with **Tailored CV (DOCX)**.
