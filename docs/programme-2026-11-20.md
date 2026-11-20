# Programme plan — 20 November 2026

The owner asked for:
- a better CV library (mechanism, indexing, look and feel);
- an evidence library that learns from every application;
- Gmail scheduling in production;
- a view of what else matters on the roadmap.

Decisions taken on 20 November 2026:
- **Production scheduling:** turn on Gmail sending in production, with its own scheduler Sheet, namespace and signing key.
- **Evidence library:** run it in production as one shared library.
- **Order:** CV library first, then the evidence engine, then the scheduler.

## What the review found

| Area | Finding | Evidence |
|---|---|---|
| CV library | **CV ranking never reads the CV text.** Preparation gets only each CV's tags and use cases, so ranking and the ATS-based recommendation work on a short profile. The indexed text is used only by the CV library page. | `score-cv-against-jd.js` falls back to `basis: 'cv-profile'` when a CV has no text; the catalogue holds `role_code`, `role_name`, `local_path`, `tags`, `use_cases` and `priority` only |
| CV library | Indexing runs only when you click **Reindex**. A changed CV goes stale silently until then. | `cv-library-v1.js` `reindex()` |
| CV library | The index holds plain text only: no sections, keywords or Word-file status. Those are worked out again by Tailored CV and the System check. | `index.json` records |
| CV library | The page is a plain table with seven buttons in a row. Status is a text string. | `cv-library-v1.html` |
| Evidence library | Switched off in production; development only. | `evidence-library-runtime.js` |
| Evidence library | Ranking uses fixed weights and term matches. Nothing learns from outcomes, and the app does not record which evidence items each application used. | `rank-evidence.js`; the feature snapshot stores counts only |
| Scheduler | Locked to development in code. It needs its own production Sheet and keys, and Gmail sending switched on in production. | `gmail-scheduling.js` `config()`, `gmail-send-service.js` |
| Recovery | The shared CV library and shared evidence folders sit outside `shared\data`, so release backups do not cover them. | `local_delivery.py` backs up `shared\data` only |

## Slice 1 — CV library (built on `feat/cv-library-index`, not yet merged)
Status:
- **Built:** all three parts below.
- **Read-only check on 20 November:** the development index was out of date for 10 of 12 CVs (last indexed 31 October), so they would have ranked on tags only. The production index was current for all 12.
- **Saved applications:** they never store CV text. It is attached only for scoring, then removed.
1. **Indexed text feeds ranking.**
   - Preparation, ATS and the CV recommendation read each CV's indexed full text when the index matches the current file (same SHA-256).
   - Otherwise they fall back to tags, and the page says so.
   - No paid call.
2. **Automatic, richer indexing.**
   - Runs at start-up and every 30 minutes, in the background, re-reading changed files only.
   - Each record adds the Word file and how it was found, the sections recognised (Summary, Experience with employer count, Key achievements), word count and top skill terms (shared ATS engine).
   - Failures are recorded per CV and never stop the rest.
3. **Redesigned page.**
   - One card per CV, with status chips: Indexed / Changed since indexing / Failed / Not indexed.
   - Each card shows the Word file, sections, top terms and last indexed time.
   - Search and filter, and actions grouped as Library, Indexing and Check.

## Slice 2 — Evidence engine (built on `feat/evidence-engine`, not yet merged)
Status:
- **Built:**
  - **What each application used:** the feature snapshot now records it as keys (selected achievements and polishing scenarios), along with the job's top terms and the terms missing from the chosen CV. Labels (achievement text, scenario titles) are kept in a separate `evidence_items` table in `application-insights-v1.db`, rebuilt with the snapshot.
  - **What it learns,** per item: uses, uses with an outcome, response and interview rates (from 5 decided uses), and when it was last used. Per job term: how many adverts asked for it, and how often it was missing (a gap is at least 3 adverts and missing in at least half).
  - **Where it shows:**
    - The achievement checklist shows a learned note on each statement.
    - "Best 12" ranking takes a bounded nudge (at most ±2) once there are enough outcomes.
    - A new **Evidence learning** page (Applications menu, `/insights/evidence`) lists proven evidence, gaps and evidence still building a record.
- **Separate branch `fix/backup-all-stores`:** release backups now cover every store, the PDF and template folders, and the shared CV library, including the evidence database.
- **Owner step for production:** switch on **Evidence library** in Feature toggles. It already uses the shared folder when `NMP_CV_LIBRARY_DIRECTORY` is set.
- **Not yet built:** offering approved tailored-CV or answer wording as candidate scenario wording.
1. **Production, shared.**
   - The evidence library runs in production from the shared folder (feature toggle).
   - The shared folders are added to release backups.
2. **Evidence usage ledger.** For each application, record which evidence items were used: selected achievements (by hash), scenario IDs and tailored-CV lines. Kept in the insights database.
3. **Learning, local only.** For each evidence item:
   - times used, response rate and interview rate (shown once there are at least 5 uses);
   - recency, and which job terms it covered.

   For each job term: how often adverts ask for it, and how often your evidence covers it (a gap list).
4. **Suggestions, never silent changes.**
   - When preparing an application, evidence is ranked by job match × learned strength, with the reason shown.
   - Gaps that keep coming up are prompted, so you write a new scenario.
   - Wording you approved in a tailored CV or a saved answer can be offered as a candidate scenario wording, which needs your approval.
   - Nothing is invented.

## Slice 3 — Gmail scheduler in production
Status: code built on `feat/production-scheduler` (Cloud scheduling is a Features switch; System check row "Gmail scheduler"). Owner set-up steps are in `apps-script/gmail-scheduler/README.md`, "Production set-up".

1. **Code.**
   - Allow scheduling when `NMP_ENV=production`, `ENABLE_CLOUD_SCHEDULING=true` and Gmail sending are on.
   - Production uses its own namespace, signing key and state, and verification stays clamped off.
2. **Set-up tool (owner-run).** Creates or pairs a production scheduler Sheet and key, then runs the diagnose tool.
3. **System check.** A "Scheduler" row: off / ready / Sheet not reachable.
4. **Owner steps.**
   - Set `ENABLE_GMAIL_SENDING=true` and `ENABLE_CLOUD_SCHEDULING=true` in `production.env`.
   - Deploy the Apps Script to the production Sheet.
   - Schedule one email to yourself as the acceptance test.

## Other important roadmap items
1. **Recovery:** back up the shared CV library and evidence folders on each ship, and document a restore drill. This matters because the evidence library becomes production data.
2. **Insights phase 3:** the insights page, once groups have at least 10 outcomes.
3. **Interview tracking:** stages, dates and preparation notes per application, building on Outcome.
4. **Job sources beyond LinkedIn:** see [insights-and-job-sources-plan.md](insights-and-job-sources-plan.md).
5. **Privacy and security review** (areas 28–30): retention, what leaves the PC (Perplexity, Gmail, the scheduler Sheet), and the at-rest exposure of base64 MIME in the scheduler Sheet.
6. **R9:** split `rendering.js` and `create-local-server.js` alongside feature work.
