# Scenario multi-selection v1

Removes the fixed 2-scenario input cap from picker, saved selection/normalisation, optional-v2 evidence bank and highlight evidence. Provider instructions consider all selected approved scenarios, choosing relevant material within the existing letter budget, not forcing every item into the letter.

No replacement count cap of 3/5/10. A shared application budget bounds the projected approved-evidence JSON to 128 KiB (131072 UTF8 bytes); existing per-scenario 8000-character approval/wording checks remain. This is an application input safeguard, NOT a provider context-window guarantee. Full request/model limits and the actual local cost estimate still apply. Selection transport grows from 16 to 64 KiB to match the normal form-scale guard. Nothing is silently truncated/unselected.

Picker shows selected count and bytes. Stale/oversize choices remain visible; errors explain what to reduce. Changes invalidate cost approval and queue a debounced LOCAL estimate, not a provider request. Confirmation states scenario count/bytes. Existing cost proof binds selection/body/CV/instructions; changing any selection requires fresh approval.

All approval/revision/source permissions, duplicate detection, private-source exclusion, word limit, evidence attribution, no automatic paid retry, stale save protection and history remain. Optional quality-v2 is not enabled. Earlier onboarding wording and other local adapter changes are retained through independent unique-anchor patches on shared files.

No letter rewrite, DB/schema migration, sending, export/PDF change, environment flag or production deployment. Save changes only the explicit scenario selection through the existing API; polishing requires its existing explicit paid-request approval.
