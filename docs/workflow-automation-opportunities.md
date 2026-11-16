# Workflow automation opportunities

Status: PROPOSED (16 November 2026). Nothing here is implemented. Each item needs the owner's go-ahead.

Rules these proposals keep: no paid call on page load, checkbox or selection changes; no automatic retries of external operations; no automatic Gmail drafts or sending; saved letters, queue copies and history are never rewritten.

## Free (no paid calls)

1. **Prepare on import.** When a LinkedIn advert is imported, run the existing local preparation straight away: CV ranking, best CV selection and the default letter from the template. The review is then ready when it is opened. No provider call.
2. **Remember export choices.** Remember the last CV format (PDF, DOCX or both) in the browser, instead of starting at "No CV" every time.
3. **Suggest newly imported contacts.** When a review opens, highlight contacts imported for the same organisation since the review was created (the freshness rule already exists). Suggestion only: no automatic linking, queueing or sending.
4. **Advert status housekeeping.** Move adverts to "Complete" when an application is sent or exported for a portal, and to "Needs attention" when a review has had no activity for a set number of days.
5. **Follow-up reminders.** Show applications sent more than N days ago with no recorded reply on the dashboard. Reminder only; no email is created.

## Paid (needs an explicit opt-in and a cap)

6. **Research once per organisation, reused.** Instead of researching on every page load, research automatically once when a new application is created for an organisation that has no research less than 30 days old. Reuse it for later applications to the same organisation, and keep the manual "Refresh research" button.
   - Cost: at most one Perplexity call per new organisation, and fewer calls than today when you apply to the same organisation more than once.
   - Controls: off by default (`ENABLE_AUTO_RESEARCH`), a daily call cap, the provider error shown if a call fails, and no automatic retry.
   - Needs: a decision to relax the "no paid call without a click" rule for this one event. Research results go in a new local table, not an existing schema.

## Not recommended

- Automatic polishing or Gmail drafting or sending: these are paid or outward-facing, and must stay explicit.
- Research on every page load: repeats paid calls for the same organisation and slows the page.
