# Early-onboarding contribution wording v1

Future polishing proposals now use an initial-weeks/early-onboarding perspective, rather than a mandatory monthly horizon. Three role-specific prospective focus areas remain: understand priorities, build working relationships and agree an approach, not guarantee major outcomes within weeks.

Opening examples are non-exhaustive: In my initial weeks..., Early on, I would..., As I get to know the team... . They are guidance, not a dropdown, fixed phrase, random picker, exhaustive menu or predictable rotation. Variation should come from role/tone/substance, not just swapped opening words. A different timescale explicitly requested by the user is not prohibited.

Changed runtime sources: structured policy, senior instructions, both adapter narrative-constraint branches, optional-v2 instruction paragraph. The role-focused policy was inspected and has no fixed-horizon rule. Optional-v2 enablement, validation logic/schema, provider/model, token cap, reasoning, search switch, wording post-validation and automatic-retry behaviour are not changed. No blanket string stripping or new hard rejection rule is added.

Existing accepted drafts, proposals already stored, queued messages, sent history and historical CV durations are NOT rewritten. Prompt changes apply on the next user-requested polish; refresh does not regenerate a proposal. Prior drafts are context, not an instruction to retain their longer future timetable. Documented historical durations remain evidence. Do not spend a paid call only to test this change.

Two stale fixed-horizon assertions in the structured-policy regression are updated to the new contract; no test or evidence/length/closing guard is removed.

Test locally:
node --test tests/application/early-onboarding-wording.test.js tests/application/structured-letter-policy.test.js tests/application/role-focused-letter.test.js

The real checkout test imports the actual request builder. The sandbox used hash-matched policy modules and an offline request-construction fixture based on the older uploaded adapter with inspected structure wiring, not the full e26 dependency graph. Full real-adapter/optional-v2 tests and normal-generation quality review remain local acceptance. No paid/provider/Gmail call or deployment occurred here.
