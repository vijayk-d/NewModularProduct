# Tailored CV (CV rebuilding, parts 1 and 2)

Status: part 1 (tailoring, Word-file lookup, **Check all CVs**, Save to folder) released. Part 2, the optional paid **Polish** step, on branch `feat/cv-polishing` (17 November 2026).

## What it does

On the application review page, **Tailored CV** makes a copy of the selected Word CV and changes only:

- **Summary or Profile.** It starts as your current wording; you edit it.
- **Bullets under each employer** (Experience):
  - ranked so the most job-relevant come first;
  - you can edit them, delete a line to leave it out, or use **Back to CV order**;
  - employer lines, titles, dates and the order of employers never change, and a bullet cannot move to another employer.
- **Key achievements section**, only if your CV has one. Bullets come from that section and from the achievements selected for this application.

Unchanged lines keep their original paragraph, so bold lead-ins and highlights survive a reorder. Edited lines take the style of that section's first bullet. Everything else stays as in your CV: name, contact details, Skills, Education, Certifications, References, fonts and layout.

Each build is saved as a new version. You can download it as a DOCX, save it to your output folder, or include it in the Export pack by choosing **Tailored CV (DOCX)**.

## Polish wording (optional, paid)

After drafting, **Polish wording (paid)…** asks a model to improve the wording of the Summary, the bullets under each employer and the Key achievements (if your CV has them), for this job, in British English.

1. **Estimate (free).** The page shows the polishing models with an estimated cost for this request. The default is this application's polishing model (the same choice cards as letter polishing, otherwise the catalogue default). Nothing is sent yet.
2. **Confirm.** **Send to <model> (about $…)** sends one request. If you change the wording or the model after the estimate, the request is refused and you estimate again. There are no automatic retries; a failure changes nothing.
3. **Review.** The polished wording replaces the text in the boxes only. Nothing is built. **Undo polish** brings back your previous wording.
4. **Build** as usual.

What is sent: the wording in the boxes, the original lines of those sections from your CV, the achievements selected for this application, and the job title, organisation, keywords and the first 6,000 characters of the job description. No web search, no contact details, no other CV sections, no Gmail.

Safeguards:
- The model is told to use only facts in that text, keep every figure exactly, keep each employer's bullets under that employer and not add bullets.
- A reply with a different number of employers, or without a summary or Key achievements, is refused and nothing changes.
- The same figures check as **Build** runs on the reply. Any problem (an invented figure, a figure moved to another employer, extra bullets) is listed under the boxes, and **Build** refuses it until you fix it.

**Setting.** Polish uses the same switch as letter polishing: `ENABLE_COVER_LETTER_REFINEMENT=true` and `PERPLEXITY_API_KEY` in `.env` (development also needs `NMP_ALLOW_DEVELOPMENT_INTEGRATIONS=true`). When it is off, the estimate still works and the page says how to turn it on. No new database or schema; the polish result is not stored until you build.

## Save to folder (opens in Word without Unblock)

Browsers mark every download, even from this app, as "from the internet". Word then opens it in Protected View or refuses it until you click **Unblock** in the file's Properties. Files extracted from a downloaded ZIP carry the same mark. The app cannot remove the mark from a browser download, so it can write the files itself instead:

- **Save to folder**, next to **Download tailored CV**, writes the tailored DOCX.
- **Save pack to folder**, in the Export pack group, writes the pack's individual files (not a ZIP). It runs the same checks as **Export pack** and uses the same CV choice.

Both write into `<output folder>\<Organisation>-<Job title>\` with the same upload-friendly names as the downloads (for example `Vijay_DAFAL_Delivery_Manager_CV.docx`). An existing file is never overwritten: a repeat save adds `_v2`, `_v3` and so on.

**Setting the folder.** There is no default. Add one line to `.env` (development) or the production settings file, then restart the app:

```
APPLICATION_OUTPUT_FOLDER=D:\JobApplications
```

The folder must be an absolute path that already exists, and it must not be inside (or contain) the app folder, its data folder, `CV_FOLDER` or `D:\NewModularProduct-Production`. If it is not set or not valid, the button says why and nothing is written. The folder is checked on every save.

Saving to a folder is allowed only from this app's own page on this computer (same origin, local address). It makes no paid or Gmail call.

## Rules

- **Free and local by default.** Drafting and building make no Perplexity call, no Gmail action and send nothing anywhere. Only the optional **Polish** step (below) is paid, and only after you confirm its cost.
- **Original untouched.** Your original CV file is never written. A tailored CV is stored as a new version in `<state folder>/cv-tailoring-v1.db`, which also holds your per-CV choices (Word file and headings) in a separate `cv_preferences` table. No existing database or schema is changed.
- **Evidence only.** Drafts use only lines that already exist in your CV or in this application's selected achievements.
- **Figures checked.** Any figure you type (%, £, numbers) must already appear in that evidence, or the build is refused and the figure is named. A figure in an employer's bullets must come from that same employer's original bullets.
- **Job keywords.** Keywords that have no evidence are shown as gaps and never added.
- **Version pinned.** The build is tied to the Word file that was checked. If the CV changes in between, you are asked to draft again.
- **Export pack.** It includes the tailored CV only if it was built from the CV selected now.

## What your Word CV needs

- **Word file.** The Word version of each library CV is found automatically, in this order:
  1. a Word file with the same name as the PDF, ignoring case, spaces and underscores (for example `VIJAY_DAFAL_GCC.docx` for `Vijay_Dafal_GCC.pdf`);
  2. the Word file you chose earlier for that CV;
  3. the only Word file in the PDF's folder.

  If the folder has several Word files and none matches, the page lists them and you choose one. A wrong file is never guessed. Word lock files (`~$…`) are ignored. The Export pack uses the same lookup for "CV as DOCX" and "CV as PDF and DOCX".
- **Headings.** A Summary or Profile, plus an Experience heading with bulleted lines under each employer and/or a Key achievements heading. Recognised names include:
  - **Profile:** Profile, Professional Profile, Personal Profile, Profile Summary, Summary, Professional Summary, Executive Summary, Personal Statement, About me, Overview.
  - **Experience:** Experience, Professional Experience, Work Experience, Employment History, Career History, Work History.
  - **Key achievements:** Key Achievements, Achievements, Selected Achievements, Career Highlights, Key Accomplishments, Highlights.
- **Untitled opening profile.** If there is no Summary heading, the first sentence-style paragraph before the first known section is used as the profile. Name, contact and headline lines (Title or Heading styles, or short lines) are skipped. The page shows it as "Opening profile (no heading)".
- **Layout.** The section text must follow its heading: in the same column, in the next table cell (two-column CV table) or in the next table row (single-column table). If the layout isn't supported, the page says so and nothing is built.
- **Your own heading names.** If a heading isn't recognised, the page lists the heading-like lines it found in your Word CV (bold, styled, capitals or ending with a colon). Choose which is Profile and which is Key achievements, then **Draft again with these headings**.
- **Choices are saved per CV, on the server.** Once a draft works, the chosen Word file and headings are reused for every application with that CV and by the Export pack. Development and production each keep their own copy.

## Adding, renaming or removing CVs

Nothing in the code lists CVs. Everything follows the live CV library, so after any change click **Check all CVs** in the Tailored CV section. It is read-only. For each CV it shows the Word file it will use, how that file was found, the sections recognised and whether the CV is ready. Fix any row it flags; there is no restart.

## Manual check before release

1. On development, draft and build a tailored CV for one real application.
2. Open the downloaded DOCX in Word. Check that it opens without a repair prompt and that the bullets and fonts match your CV.
3. Export a pack with **Tailored CV (DOCX)**.
4. With `APPLICATION_OUTPUT_FOLDER` set, click **Save to folder** and **Save pack to folder**, then open the saved DOCX straight from the folder: it should open in Word without Protected View or Unblock.
5. With polishing turned on, draft, click **Polish wording (paid)…**, check the estimate, send once with the cheapest model, read every polished line, try **Undo polish**, then polish again and build. Check the cost reported on the page against your Perplexity usage.
