# Approved scenarios in polishing — development candidate

Built against GitHub commit cd7ae3eb836375dcd27dc502b6df4555c77e10e2. The six modified baseline source blobs were verified against previously fetched GitHub identities; no repository write was performed.

## Workflow
Open an application on development port 3000. In the polishing section, choose zero, one or two eligible scenarios, inspect approved wording, and Save scenario selection if you want to retain the choice without polishing. A confirmed polish also saves the selected snapshot. Selections alone make only local catalogue/save requests, never a paid request. No current letter, subject, CV, queue row, draft or sent history is rewritten by selection/save.

Eligibility requires approved=true, source-supported or user-confirmed evidence, current assignment approval, valid provenance fields and nonempty approved wording. Micro1 evidence remains excluded. Private source passages, reference text, confirmation comments and assignment/scenario titles do not enter the scenario provider payload: only scenario ID, evidence state and approved wording do. Names or other details you deliberately include in approved wording do go to the provider. Local preview labels can contain private titles; review before screenshots/sharing.

## Version and approval controls
Snapshots retain scenario/assignment IDs and revisions, approved wording, evidence state and a provenance digest, not raw private passages. Changing a scenario or its approval invalidates old references. Cost proof binds the selected versions, review identity, saved letter/JD, selected CV role and request context; the existing model guard remains in force. Selection changes during estimate/confirmation require another estimate/confirmation. The server revalidates before the provider call, after response and on proposal acceptance. If approval/context changes while the call is in flight, the provider call may already have incurred cost; the new proposal is rejected without automatic retry. Previous successful proposals follow existing retention behaviour but their evidence is checked before acceptance.

Proposal provenance is visible in an expandable section. Accepting a proposal records a cloned evidence snapshot in refinement history, so later selection edits do not erase the evidence used for that accepted version. Manual letter edits still require your review; a snapshot is not proof every later edited claim is supported.

## Evidence and writing
The model receives approved scenarios as additional explicitly selected evidence, including alongside the existing achievement checklist. It must not invent missing problems, mechanisms, causation or results, transfer claims across employers, infer an unknown attribution, diagnose a target employer's private problems or promise repeated outcomes. It may use fewer than the selected scenarios to avoid repetition or exceed neither the existing length limit nor relevant evidence. No automatic scenario ranking or semantic truth-verification is claimed.

Contextual highlighting now accepts the selected approved wording as supporting evidence alongside CV/profile evidence. Private sourceQuote fields are not used. Existing JD match, passage/context uniqueness, entity/generic-word exclusions and overlap checks are unchanged.

## Runtime boundary
No new schema, database, configuration flag or production migration. The existing evidence store remains development-only. In production or unavailable-library runtimes, the picker explicitly reports unavailable; empty-selection polishing remains compatible. A saved nonempty selection cannot silently bypass validation there: explicitly clear it to polish without library evidence. Production enablement is a separate storage/privacy/release decision.

## Acceptance and limits
124 focused tests passed in the isolated harness, including real server routes, cost binding, revocation races, privacy, legacy polishing and highlight compatibility. Actual review-page/client Chromium checks passed for max-two selection, save/reload, a single confirmed polish/apply, visible provenance, a changed-selection estimate race and mobile width. Library/provider data were synthetic; unrelated legacy route handlers were fixture adapters because the older uploaded source lacks those modules. This is not full-project, real-provider, real-evidence or live-production verification. Packaged Playwright tests run with the complete checkout's actual route dependencies and synthetic library/provider ports. Before checkpoint: replay tests locally, restart development to confirm persisted selection, and pilot one genuinely approved scenario.
