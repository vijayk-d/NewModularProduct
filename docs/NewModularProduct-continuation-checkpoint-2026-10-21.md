# NewModularProduct — continuation checkpoint and roadmap priorities

Checkpoint date: 21 October 2026
Purpose: persist locally and use as handoff context for a future development session.

## Current operating boundary

- Development: `D:\monorepo\NewModularProduct`, loopback port 3000, started via the existing `start-local-server.bat`.
- Production: `D:\NewModularProduct-Production`, loopback port 3100. It restarted successfully after a stale supervisor lock caused by the user-reported abrupt laptop shutdown. The root cause is plausible, not proven. The user removed the stale lock only after read-only inspection showed old supervisor/Node PIDs were absent, no listener existed on 3100 and the status heartbeat was over eleven hours old.
- Production must not be stopped or changed during normal development checks. Never delete supervisor locks without checking process/status/port first.
- Existing private scheduler authorisation and its private sheet are configured under a dedicated OAuth project. Existing reports showed `configured:true`, the sheet ID `1lcVbf1GQhJlrYU4eQGab_2YRrv7aU1ZnXiHOVn71SHw`, namespace `4be96a87-1bd4-cb7a-4bc8-a09b3ade5f06`, and local scheduling flag false. Do not reauthorise or recreate it.
- Never request/share `.env`, OAuth client JSON/tokens, actual CVs or databases. No assistant-run live Gmail, Google, ATS or production action has occurred.
- User prefers a focused, consolidated bundle and speed after essential checks; avoid gold-plating or many partial patches.

## Source/artifact continuity

- Only complete uploaded source snapshot available: `next-slice-source-20261019T185518217479Z.json`, 263 files, source HEAD `1c641c44ca711cd76713fd1de9f01c132c45b3dd`.
- Its contents were source-captured and hash-checked in prior sessions. Do not call it a live checkout, current Git tree, or the user's post-install state.
- Development CV/Word rebuild bundle: `development-rebuild-CV-Word-v1.zip`. User ran installer `--check`; it reported 518 pass, 0 fail, 1 skip application tests and 83/83 Python tests, then user confirmed `--apply` reported `APPLICATION INTELLIGENCE DEVELOPMENT SOURCES APPLIED` and started development. The confirmed installation is the cumulative CV/Word rebuild plus the earlier firstname-export hotfix, installed before the later application-intelligence bundle.
- The 1 skipped app test should be identified before production promotion; never count it as a pass.
- The next `application-intelligence-MVP-development-v1.zip` was delivered, but user has NOT confirmed that it was checked/applied. Assume the history/assessment panel and new `application-intelligence-v1.db` are NOT installed until the user reports otherwise.
- The earlier candidate source notebooks/files were ephemeral and no longer exist in the current tool session. Do not assert those exact worktrees are available.

## User-confirmed runtime observations

- The user explicitly confirmed the actual selected `Vijay Dafal_ProgMgr.pdf` preview showed correct Programme Manager CV text and the exact-original download opened the correct PDF.
- After the firstname-export update, the user reported the ZIP export downloaded. Immediately before the later grouped-history work, they still reported this error when exporting: “Saved plain and formatted letter disagree. Save/review the letter again. Queue/Gmail unchanged.”
- Investigation reproduced the parity failure: the saved letter had `I am applying for the [role](advert URL)` in rich HTML while plain text also retained `Role details: <advert URL>`. `restoreLinkedOpeningPlain` normalises this case for Gmail/send validation, but the exporter only handled an advert-only standalone paragraph. A precise export fix was designed in an isolated ephemeral source tree and 12 targeted checks passed, but the source/artifact was lost. The durable rebuild bundle does NOT include that fix. Rebuild it from current live source, ensure only the approved exact link/role representation is normalised for comparison, and ensure exported/stored letter bytes remain unchanged. Do not weaken real content divergence checks.

## Most recent grouped-history state — NOT INSTALLED

User asked to group the many sends shown separately under paired address variants. The user output showed, for one Relief International LinkedIn vacancy, many pairs such as first.last@ri.org and last.first@ri.org, with 125 legacy operation records lacking robust vacancy metadata. This is strong evidence of UX/contact grouping need, NOT proof paired addresses are the same verified contact.

Design/evolving prototype:
- Group by exact stable vacancy/application key + normalized contact identity (prefer fullName; address fallback) for presentation only.
- Preserve each send row, every address, action, timestamp and exact Gmail message ID. Warn for alternate addresses; label inferred/manual/unknown address source and verification separately. Never auto-merge/delete/verify addresses.
- Keep different vacancies separate. Missing identity remains separate/unknown rather than guessed. Similarity/alternate identity must never silently become an exact match.
- Existing API `items` compatibility should remain; add per-send contact/vacancy `groups` and paginate consistently. Search should filter send records before grouping. Do not return full message body.
- No schema migration, send-path change, Gmail operation or mutation of history.
- 19 focused renderer/API/queue/SQLite tests were reported passing in prior temporary work; full application suite 490/490 passed only after restoring the missing test helper and test-only versioned template. The full queue browser module did not mount in a synthetic harness; later isolated renderer/browser testing used a static fixture. The candidate is not packaged or installed.
- The previous temporary renderer fake-DOM suite had iterations where test doubles lacked `replaceChildren`, table-header/body, or textContent behaviour. Do not claim a failing run passed. In future, use `jsdom`/the existing Playwright browser if available, or faithfully implement DOM semantics. No Chromium server connection is proof of UI integration unless the actual queue root and module mount.
- A later dedicated static fixture/server attempt also had a harness-root/port problem and did not establish the actual full application queue mount. This remains an explicit acceptance gate, not a finished browser integration.

## Application Intelligence MVP notes — development bundle delivered, install unconfirmed

Requirements were requested and written to `Application-History-and-CV-Learning-Roadmap.md` in tool output, but that roadmap file/source is not necessarily present in the current user's checkout. The separate dev source bundle `application-intelligence-MVP-development-v1.zip` has not been confirmed applied.

Intended MVP:
- Prior activity check against saved review/queue/draft/confirmed-send/manual external submission records; never claim inbox/portal audit.
- Distinguish saved/prepared, queued/drafted/scheduled, confirmed outreach vs user-recorded external submission. An email send is NOT proof of ATS submission. “No match in stored records” is not “never applied.”
- Exact vacancy identity by stable source job ID, advertiser-scoped reference, canonical URL with only known tracking parameters removed; possible repost/similarity stays advisory. Cross recruiter recipient variants should find exact vacancy history.
- User-confirmed external submission entry with source/provenance/idempotency, and non-destructive void correction.
- Versioned assessment snapshots: CV role/file hash/text hash, JD hash, assessment/scoring scheme, complete requirement coverage/gaps, extraction warning. Do NOT store full CV/JD text in the history DB or sheet. Legacy score is separate.
- Current MVP “literal keyword coverage” is not employer ATS score, semantic fit, skill proof, or interview probability. Unavailable extraction is `unavailable/null`, never score 0 or metadata fallback.
- Separate local `application-intelligence-v1.db`, explicit schema guard and development-only initialization. Production database migration/backup contract not included. Test installer check/apply against exact current local source first.
- User's previous installation report did not include this feature bundle, so assume absent.

## Highest-value remaining work (recommended order)

1. Close the observed export plain/HTML parity bug with a surgical, fully tested source patch.
2. Finish grouped-history browser integration as an optional high-value UX fix after acceptance; no store rewrite.
3. Inspect the current 3000 dev checkout changes/source guards and establish which bundles are actually installed. Re-run preflight only after that evidence.
4. Application Intelligence MVP install/verify on dev 3000, if its bundle is current and hash check passes. Test history search against the user's actual existing records locally; don't ask them to upload records.
5. Role-family recurring gap dashboard, with complete assessed requirement counts, denominators and immutable versioned CV/JD/scorer snapshots.
6. Evidence-led SMART achievement rewrite proposals: source-backed evidence, user-reviewed; missing metrics/timeframes remain missing; no fabricated targets/results.
7. Recruiter search links: user-requested manual, user-clicked LinkedIn search URLs only. Expose title/company/location query variants (e.g. Director, Head, Talent), open the LinkedIn People search page, no scraping/bots/profile extraction or automatic email inference. LinkedIn prohibits unauthorized automation/scraping; user controls search/results and explicit contact selection.
8. Apps Script scheduling work stays a separate high-risk track; not enabled. Complete live per-file permission, signature, crash/cancel race and rollback acceptance before enabling any trigger.
9. Don't enable or test live Gmail sending as part of these slices. Existing per-message explicit confirmation remains.

## What to ask the user for before resuming

- Confirm whether `application-intelligence-MVP-development-v1.zip` was run on `--check` and `--apply`; if yes, share only safe summary/errors, not data.
- For export parity, ask them to confirm exact non-sensitive shape only: is the advert URL repeated in a “Role details” plain line, or is there another rich-vs-plain difference? No CV/letter body required.
- Do not ask to repeatedly rerun Google OAuth, recreate the sheet, share client credentials or modify the `.env`.

## Claims that are not justified

- No current live source tree or actual CV/JD/recruiter/email database was inspected by the assistant.
- The broad original full-product roadmap is not complete. CV/Word development is confirmed installed; scheduler, SMART, history-group browser/package and prior-application bundle status remain as documented above.
- Browser acceptance of the grouped-history patch is not complete; do not say that it is.
- No production promotion, Google worker installation, scheduling trigger creation, email send or rollback occurred in these assistant sessions.
