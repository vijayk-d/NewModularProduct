# Workflow automation

Status: IMPLEMENTED on branch `feat/workflow-automation` (16 November 2026). Not yet released.

These rules still hold: no paid call on page load, checkbox or selection changes; no automatic retries of external operations; no automatic Gmail drafts or sending; saved letters, queue copies and history are never rewritten.

## What is automated

1. **One-step advert load.** Choosing a stored LinkedIn advert loads it and fills the form straight away (it used to take three steps: choose, Load, Use). If the form already holds another advert's details, the existing confirmation still appears. Preferred CVs and achievement selection stay your explicit choice, and **Generate application** is still a click. Creating applications automatically on import was not built: it would skip those choices.
2. **Export choice remembered.** The Export pack CV choice is remembered in this browser.
3. **Same-organisation contacts.** Newly imported contacts whose email domain matches the application's domain get a "Same organisation" badge and are listed first. Nothing is linked, queued or sent automatically.
4. **Advert status housekeeping.**
   - An advert counts as Complete when a portal pack has been exported ("Complete — portal pack exported").
   - Saved work with no activity for 14 days shows as Needs attention.
   - Status is still worked out from local records each time; the stored status is never changed.
5. **Follow-ups due.** The dashboard lists applications with a confirmed email and no later recorded activity for 7–60 days. Reminder only: no email is created.
6. **Organisation research once per organisation.**
   - When you create an application, the organisation is researched automatically (one paid call) unless it was researched in the last 30 days. Later applications to the same organisation, and page reloads, reuse the result with no new call.
   - The research button always researches again and refreshes the shared copy.
   - A failed call is shown and not retried.
   - At most 10 automatic calls a day (`AUTO_RESEARCH_DAILY_CAP`). Set `ENABLE_AUTO_RESEARCH=false` to turn it off. It also needs `ENABLE_PERPLEXITY_RESEARCH=true`, like the button.
   - The review page says when research ran automatically or was reused.
7. **Email domain follows the latest finding.** A domain found by organisation research (automatic or the button) or by **Find email domain** replaces the old one. It is saved on the application, linked contacts' suggested emails are refreshed, and the browser copy used by the LinkedIn contact bridge (`nmp.lastSavedEmailDomain`) is updated. Invalid or personal-mail domains (gmail.com, linkedin.com and similar) are ignored.

## Storage

All new data is in a new file, `<state folder>/workflow-automation-v1.db`: research cache, daily automatic-call count and portal export records. No existing database or schema is changed. If the file cannot be opened, automation is turned off and the app keeps working.
