# Cover-letter quality implementation v1 — development candidate

## Scope

This is the application-code implementation, not the earlier instruction-only pack. It is built against the 29-file 2026-10-18 source snapshot on feat/review-provider-output, HEAD a219286dae282ec25be522919a1f1dbf3131c06c. Existing working-tree changes are allowed but every affected captured source file must match its recorded baseline or this package's installed version.

Implemented:
- One reconstructed senior-writing instruction module used by actual provider requests.
- Standard mode targets 300–400 full-letter words, with a maximum of 400; Extended mode is explicit and supports up to 500, subject to the configured cap.
- Existing COVER_LETTER_REFINEMENT_MAX_WORDS is honoured, not rewritten. The existing runtime default remains 450; 500 is now an accepted explicit setting. Thus Extended may display 400–450 with current/default configuration. Set the existing key to 500 once only if you want the full 500-word option. No startup or .env edits are made by this installer.
- Exact protected-section budgeting, rather than a fixed 120-word deduction.
- Full composed-proposal length checks and a second server-side check on acceptance.
- Explicit length cards, separate current/proposed live counters and honest Page fit not checked status.
- Length-rejected proposals are retained separately from the current/good proposal. A deliberate local Extended reassessment can promote a suitable retained candidate to the reviewable proposal without a new AI request; it does not accept or send it.
- Scope/evidence rules preserve selected achievements, employer attribution, Micro1 exclusion, reviewed employer/agency context, professional values and selected tone/model.
- The initial generator no longer supplies an unsupported default UAE prompt-joining claim; an explicitly supplied candidate note is preserved.
- Shared policy import resolves both from the Node filesystem and the browser's exact static route. The old test-file import failure is covered by regression tests.

Not implemented by this package:
- Actual selected-CV preview links, Word-document support or scheduled email delivery.
- A PDF/Word page-layout renderer or proof of one-page fit.
- Semantic verification that every model-generated claim is true; user review and evidence attribution remain necessary.
- Retrofitting quality policy into existing queued messages or Gmail send/draft preparation. This slice checks generation/polishing/review/acceptance; final personalised-mail guards remain a subsequent mail-pipeline task.
- Redesign of existing proposed-editor acceptance semantics. Live counts reflect visible edits; the existing Use proposal action still accepts the stored proposal. To retain other proposal edits, use the existing copy-to-current editing workflow. No editing behaviour is silently changed.

## Safety

Production, existing saved records, subjects, queues, credentials, .env, launchers, model catalogues, signature handling and CV files are not modified by installation. No Git staging/commit/deployment or real-provider test calls occur. New fields are added only when users explicitly run/reassess/accept polishing, not by visiting a saved application. Manual current-letter edits remain saveable outside the target; there is no silent padding, truncation or paid retry.

The source guard uses normalised UTF-8 checksums and preserves existing CRLF/BOM representation when writing modified files. All JSON cache reads/writes have explicit UTF-8 encoding. It does not reuse or alter Slice 1/2 payloads.

One existing runtime-config boundary test is updated through two exact guarded replacements: the invalid example 451 becomes 501, and the corresponding upper-bound message 450 becomes 500. Its other current contents are retained. The installation plan records the exact original and resulting hashes before any source write.

## Installation

Extract this ZIP into the development repository. It adds only tools/patches/cover-letter-quality-v1 package files at extraction time. Stop development on port 3000 before applying; leave production on port 3100 running.

Run from the development repository:

    python tools/patches/cover-letter-quality-v1-1/install.py --root .
    python tools/patches/cover-letter-quality-v1-1/install.py --root . --apply --verify
    python tools/patches/cover-letter-quality-v1-1/install.py --root . --browser

Check each exit code before continuing. The first command only validates and prepares a package-local plan. It does not write application source. Source is backed up before apply. Node verification failure triggers guarded automatic source restore. Browser failure retains the candidate and logs for inspection; do not commit/deploy.

Do not rerun the earlier Slice 2 installer/verifier over intentionally changed quality files: its old exact source hashes no longer describe this candidate. Use this package's verification plus the retained regression suites.

## Rollback

Stop development and run:

    python tools/patches/cover-letter-quality-v1-1/install.py --root . --rollback

Rollback refuses if an affected file changed after this package wrote it. It restores original source bytes, removes only this package's unchanged new files and never rolls back user data. Keep backups and the package installation plan.

## Validation record

In this assistant environment the new/updated application, provider, domain, config and live-helper tests run with synthetic data and fake provider ports. All 87 tests passed under Node v20.20.1 before packaging. This is not a Node 24/Windows/full-application browser verification. The full HTTP tests and Playwright suites must run in the actual development environment using the above gated commands. No npm/pip installation is performed automatically.

Acceptance: confirm new and existing reviews preserve saved text/subjects/model/tone; Standard and Extended show the effective cap; live counts update without changing the letter; no paid call occurs on choosing a mode; retained candidates can be reassessed without AI; page fit remains explicitly unchecked until a real rendering check exists.

## v1.1 prompt-contract correction

Restores the exact tested rule Missing SMART details stay missing. The existing Slice 1 regression assertion is unchanged. The reported v1 local run passed 183 of 184 tests; the full v1.1 suite must be rerun locally.

## v1.2 release-gate prompt compatibility

Restores explicit summary-level employer attribution, source-role/project metric attribution, English-only warnings, current-engagement uncertainty and missing-SMART-detail contracts in the actual provider system-instruction module. Existing writing-quality rules remain unchanged. No test is weakened. The verifier now runs all discovered Node test files in batches of 30 before browser checks. The first full checkpoint batch previously reported 288 passes, one attribution-contract failure and one skip; later batches had not run. A fresh reviewed checkpoint plan is required after this upgrade.
