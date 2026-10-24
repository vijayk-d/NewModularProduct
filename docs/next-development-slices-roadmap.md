# Development roadmap: next application slices

Status: PLANNED — no application, database or production changes applied by this document.
Operating model: development on port 3000; production on port 3100 remains usable. Promote only an explicitly reviewed and tested commit. Do not reseed production data.

## Delivery policy

- Deliver two coherent development packages rather than a sequence of ad hoc UI patches.
- Each package includes complete affected files, related automated tests, installation/verification instructions, backup/rollback instructions, and a roadmap status update.
- Use one current development-source snapshot for each package; do not assume older uploads are unchanged.
- Work on development only. Existing production configuration, credentials, saved applications, contacts, queued snapshots, drafts and sent history must not be overwritten.
- Do not silently enable Gmail or change production feature flags during UI work.
- No new deployment mechanism, vector database or background paid-processing pipeline is required for these slices.

## Slice 1 — Evidence-led application preparation

### 1. Preferred CV role codes

Expose all supported codes from the configured CV inventory as searchable multi-select options showing both code and readable role name. Do not invent unsupported codes or imply a corresponding CV exists. Preserve existing saved preferences and the distinction between preferred codes and the one selected attachment.

### 2. Achievement checkbox selector

Replace free-text CV Highlights for new preparation flows with selectable evidence-backed achievements. Preserve existing saved free-text highlights as legacy application evidence rather than deleting or silently reinterpreting them.

Workflow:
1. Read the selected CV and any explicitly approved career evidence.
2. Produce candidate achievement statements grounded in those sources.
3. Show result, personal contribution/how, supported metric, timeframe and source attribution.
4. Let the user inspect the evidence and select the statements to include.
5. Compose the default cover letter from the selections.
6. Pass selections and their evidence to Perplexity only after the user requests polishing and confirms the existing cost step.

Statement template, not a candidate fact:
Delivered [documented result] by [documented actions or methods], within [documented timeframe].

Evidence rules:
- Every material claim must link to its source passage and source version/hash.
- Keep employer, role/engagement, timeframe, achievement and personal contribution together.
- Do not borrow a portfolio metric for an individual engagement without explicit source support.
- Do not treat an employment period as proof of a delivery deadline or time-to-result.
- Do not invent targets, percentages, dates, savings, budgets, team sizes or causal explanations to fill SMART fields.
- Qualitative supported outcomes remain usable, but must not be labelled fully SMART when measurement/time evidence is absent.
- Unsupported proposed details remain unselectable until supported by evidence or explicitly verified by the user.
- Keep team outcomes distinct from the candidate's personal contribution.
- Suggestions may be ranked for JD relevance, but not silently selected or sent.
- No paid model call on page load, checkbox changes, CV changes, model changes or tone changes.

Persistence:
Store selected achievement IDs plus approved wording and evidence-version snapshots with the application where possible. Revalidate selections when the selected CV changes. Changes to an evidence catalogue must not rewrite saved letters or existing queue snapshots. Keep private evidence outside Git and release source archives.

### 3. Preparation layout

Place job title, organisation/advertiser name and job location in a responsive three-column row on wide screens. Stack naturally on narrow screens and preserve full editable values.

### 4. Job poster details

Display imported poster name, supplied headline and safe profile link in the relevant section. Do not infer a poster, infer an email, auto-import a contact, queue a message or send anything merely because a poster is present.

### Slice 1 acceptance

- Supported CV codes load from inventory and existing selections survive save/resume.
- Selected achievements survive reload and reach the default letter and polishing request with matching evidence.
- Invented metrics/timeframes/causation are rejected or marked unsupported.
- CV switching cannot silently reassign a claim to another engagement.
- Existing applications and queue snapshots remain unchanged.
- Preparation remains usable on wide and narrow viewports.
- Extraction/selection does not trigger a paid or Gmail action.

## Slice 2 — Application review workspace and selection controls

- Add a floating left-side section navigator with small icons, accessible names, keyboard navigation, active-section indication and no overlap with content. Collapse appropriately on narrow screens.
- Rearrange Vacancy details into a compact responsive grid.
- Place Email domain immediately after Vacancy details, alongside it on wide screens and underneath on narrow screens. Keep one authoritative domain field/state.
- Put Save application and Delete application next to each other. Preserve separate handlers, deletion confirmation and revision checks.
- Put rating/ATS summary elements in one compact desktop line, with responsive wrapping.
- Replace the polishing-model dropdown with visible single-select choice cards. Set the catalogue entry labelled GPT-6 Luna as the default for NEW applications; retain saved applications' existing selections. Validate the real provider ID against the application's catalogue.
- Replace the tone dropdown with visible single-select choice cards. Preserve saved choices.
- Use checkbox-like visual cards if desired, but native radio semantics for a single model/tone per request. True multi-model comparison is out of scope and requires a separate explicit cost/behaviour design.
- Keep genuine checkboxes for achievements and preferred role-code multi-selection.
- Move Unlink selected and Clear linked contacts above the Linked Contacts table.
- Move the existing below-table actions above Available imported contacts.
- Rearrange Imported LinkedIn advert into a responsive information grid, with expandable full description and poster details where supplied. Preserve captured content and provenance.
- Give Recorded sent history subject the flexible column width; compact other fields and keep technical details expandable. Prefer a single subject line on wide screens, while retaining full text and a usable overflow/expansion path for exceptional lengths and narrow screens.

### Slice 2 acceptance

- Navigation targets and keyboard/focus behaviour work at supported viewport sizes.
- Exactly one model and one tone are submitted; selecting them makes no provider call.
- GPT-6 Luna default affects new applications only.
- Save/Delete retain their independent safety checks.
- Moving contact actions does not change recipient selection, deletion protection, unlink scope, queueing or mail behaviour.
- Source links, full subject text, Unicode, currency symbols and evidence remain intact.
- Tests are updated alongside changed UI contracts, not loosened simply to make a suite pass.

## Separate operational task — production Gmail readiness

The last reported configuration had credential-presence checks true but all Gmail flags false. Disabled features can cause runtime credential clearing; the UI must distinguish configuration-disabled from missing credentials or authentication failure.

Do not enable sending as part of either development slice. First choose production drafts-only versus drafts-and-sending. Then make a backed-up configuration-only update, restart production, and explicitly verify the intended mailbox before creating any draft or sending email. Do not ask for credential values in chat.

Do not rerun the older Perplexity-enablement utility after Gmail is enabled without revising it: that utility deliberately turns Gmail flags off.

## Milestone status

- Production baseline and local release workflow: established in the preceding work; current live state still requires local verification when deploying.
- Slice 1: planned; recommended next functional slice.
- Slice 2: planned; consolidated review-workspace package.
- Gmail enablement: pending explicit capability choice and mailbox verification.

At each slice completion, update planned/in-progress/verified/released status, record test results and commit ID, and keep production release approval separate from development verification.


## Agreed addition — Assignment evidence library (23 October 2026)

Status: PLANNED. This patch adds the roadmap specification only; no library UI, database, CV ingestion or paid extraction is implemented.

Purpose: Build one comprehensive evidence-backed record for each assignment/contract/role, containing multiple challenge, opportunity, decision and learning scenarios. Reuse approved scenarios for vacancy-specific cover letters, CV proposals and interview preparation.

Assignment overview: separate employer, contracting entity and end client; record title, dates, mandate, authority, starting position, organisational roadmap, delivery landscape, stakeholders, overall contribution and confidentiality.

Scenario fields: situation and business impact; diagnosis and evidence; options considered and trade-offs; personal decision/contribution versus team ownership; actions, techniques and mechanisms with reasons for their selection; tactical intervention; documented strategic objective and connecting mechanism; outcomes with baseline, measure, scope and measurement period; setbacks, adaptations, sustainability and lessons. Link every material claim to a source/version or explicit user confirmation. Contract duration is not delivery duration.

Evidence states: source-supported, user-confirmed, needs clarification, restricted, unsupported. Missing SMART details stay missing. Never transfer outcomes across engagements, infer causation from nearby facts, invent organisational strategy, inflate ownership, or infer current employment. Private evidence stays outside Git/release archives; confidential details must be excluded or anonymised before provider submission. Preserve immutable approved scenario versions.

Outputs: approved short cover-letter paragraphs, concise CV bullet proposals, interview summaries and deeper explanations, follow-up questions covering diagnosis, alternatives, resistance, personal contribution, outcomes and learning. A send is not evidence of ATS submission.

Delivery sequence:
1. Define the assignment/scenario template and evidence/approval rules.
2. Pilot one assignment with source passages and user recollections; flag unanswered questions instead of filling gaps.
3. Validate cover-letter and interview outputs against that record.
4. Populate further assignments in batches.
5. Integrate explicit scenario selection into polishing; send only relevant approved excerpts after existing cost approval.
6. Add interview preparation and evidence-gap views.

Acceptance: correct engagement attribution, traceable approved wording, preserved uncertainty/confidentiality, separate personal/team outcomes and tactical/strategic scope, no paid call on browsing/selecting, no rewriting saved letters/queue/history, no automatic CV update or sending.


## Assignment Evidence Library MVP — development candidate (23 October 2026)

Manual assignment/scenario editor, separate development-only SQLite storage, explicit evidence/approval states, revision-conflict checks, retained versions, private dossier/interview-outline export and approved-extract export implemented in the candidate package. No paid calls or automatic polishing integration. Source tests and isolated browser acceptance are separate from user acceptance, Git checkpoint and production release. See docs/assignment-evidence-library-mvp.md. Next: pilot one real assignment locally, validate source attribution/confidentiality, then design explicit approved-scenario selection for polishing. Do not mark the full library roadmap complete.
