# Link-click tracking

Knowing whether a recruiter clicked the LinkedIn advert link or your LinkedIn profile link in an email sent by JobApp.
Clicks only: no open tracking, no hidden images. Off by default.

## Decisions (agreed 2026-11-25/26)

- **Links tracked:** two only.
  - The LinkedIn job advert link in the letter.
  - Your LinkedIn profile link (the logo in your Gmail signature).
  - The CV is attached, not linked, so it is not tracked.
- **Address:** the free `https://jobapp-links.<your-subdomain>.workers.dev`.
  - It can change later. New emails use the new address as soon as `.env` changes.
  - Keep the old Worker running for about 90 days, until older emails no longer matter.
- **Disclosure footnote,** a small grey line under the signature. Default (changed 2026-11-26 to read less like a warning):
  "The links above go through a simple click counter so I can see which ones are useful. Nothing else is tracked."
  Set `LINK_TRACKING_FOOTNOTE` in `.env` to use your own wording (one plain line, 20 to 240 characters, no links). It can be reworded but not removed: blank means the default.
- **Privacy:**
  - Cloudflare only ever sees a random link number, never who it was sent to. Which number belongs to which recipient stays on your PC.
  - No IP address, location, browser or device details are stored.
  - Records delete themselves after 90 days.
  - The Worker can only send people to LinkedIn: job adverts (`linkedin.com/jobs/view/<number>/`) or your own profile. Any other link, or one with a bad signature, shows "This link is not valid".

## How a tracked link works

```
https://jobapp-links.<sub>.workers.dev/c/<linkKey>.<id>.<signature>
```

- **linkKey** is `p` for your profile, or `a-<job number>` for a LinkedIn advert.
- **id** is random, one per recipient and link.
- **signature** is an HMAC with a secret key that only your PC and the Worker know, so links cannot be forged.

When someone clicks, the Worker:
1. checks the signature;
2. notes the id, the link, the time, and whether the click looks like an email security scanner;
3. sends them straight on to LinkedIn.

A click counts as a scanner check when:
- it is a HEAD request or a prefetch;
- it has no browser;
- it comes from a known scanner, such as Mimecast or Safe Links.

The app also ignores clicks within about 60 seconds of sending (Stage 3).

Code: `tools/link-tracker/`
- `src/domain/outreach/link-tokens.js` (in the app) signs and checks links; the Worker imports it.
- `src/worker.js` is the Worker itself.
- Tests: `tests/tools/link-tracker.test.js`.

## Stages (one pull request each, development before production)

| Stage | What | Status |
|---|---|---|
| 0 | Decisions above | Done |
| 1 | Worker, signed links, tests, and this deploy guide | Done; deployed 2026-11-26 at `https://jobapp-links.career-links-5141.workers.dev` |
| 2 | Local id store (new file `link-tracking-v1.json`); links rewritten and footnote added when an email is prepared for Gmail (send or draft), behind `ENABLE_LINK_TRACKING`; tested by sending to yourself | Done (2026-11-26) |
| 3 | "Check link clicks" button (read-only, no automatic retries); scanner filtering; clicks shown on Outcome and as an amber "follow up" next step | Done (2026-11-26) |
| 4 | Opt-out handling, clean-up, a week's trial in development, then production | Code: this change. Trial and production: your steps below |

## Switching it on in the app (Stage 2)

Links are swapped when an email is prepared for Gmail (Send, or Create Gmail draft), not when it is queued, so the
queued letter stays as you wrote it and the profile link (which only exists in your Gmail signature) can be included.

- **Advert link:** the linked role title and the `Role details:` line, only when the application's advert is a LinkedIn job.
- **Profile link:** any link to your LinkedIn profile in the Gmail signature.
- **Footnote:** added under the signature whenever at least one link was swapped.
- **No Gmail signature:** nothing is tracked (there is nowhere for the footnote); the server log says `SKIPPED reason=no-signature`.
- **Same email, same links:** each queue item keeps its ids, so preparing again gives an identical message.
- **Editing a tracked Gmail draft:** Update Gmail draft keeps the same tracked links and footnote. This still works after switching tracking off, as long as the `LINK_TRACKING_*` settings stay in `.env`.
- **Ids:** kept in `link-tracking-v1.json` in the data folder, with the application and recipient. Never committed, never sent to Cloudflare.
- **Set up wrongly:** sending and drafting stop with a message naming what is missing. Nothing is sent untracked by surprise.

Add these lines to `.env` (development first), using the same signing key you gave the Worker:

```
ENABLE_LINK_TRACKING=true
LINK_TRACKING_BASE_URL=https://jobapp-links.career-links-5141.workers.dev
LINK_TRACKING_SIGNING_KEY=<the signing key>
LINK_TRACKING_PROFILE_URL=<your LinkedIn profile address, as given to the Worker>
```

Optional, your own wording for the footnote:

```
LINK_TRACKING_FOOTNOTE=I count clicks on these two links to see which are useful. Nothing else is tracked.
```

The read key is not needed until Stage 3. Restart the app, then send one application email to your own address and
click both links: each should open LinkedIn. The switch also appears on the Features page as "Link-click tracking".

## Seeing clicks (Stage 3)

Add the read key to `.env` (the second key you made; the Worker has it as `READ_KEY`) and restart:

```
LINK_TRACKING_READ_KEY=<the read key>
```

- **Where:** each application's Outcome section has a "Link clicks" box with **Check link clicks (read-only)**.
  The box only appears once the tracker address and read key are set.
- **What a check does:** one request to the Worker (more only if it has several pages), nothing else. No automatic retries and no background checking.
  If the Worker cannot be reached, nothing changes; click again later.
- **What counts:** only clicks on links this app gave out. Left out: anything the Worker marked as a scanner, and clicks within 60 seconds of the email being sent.
- **Saved:** clicks are kept in the new file `link-clicks-v1.json` in the data folder (only the link id, which link, the time and the scanner mark).
- **Next steps:** after a check, an application whose email link was clicked in the last 14 days, after the last send and with no reply recorded, shows an amber "Follow up: link clicked ..." step.

## Opt-outs and clean-up (Stage 4)

- **Opt-out:** if someone asks not to be tracked, open any application's Outcome section and, under Link clicks,
  add their email address (or `@theirdomain.co.uk` for a whole organisation) in **Not counted**.
  - Their emails get plain LinkedIn links and no footnote (the server log says `SKIPPED reason=opted-out`).
  - Clicks on links already sent to them stop counting, and no follow-up step comes from them.
  - **Count again** removes them. The list is kept in `link-tracking-v1.json` on this PC.
- **The privacy page** now says how to opt out (reply to the email). Redeploy the Worker once for this:
  run step 5 of the deploy guide again from the repository folder.
- **Clean-up:** link ids older than 180 days are dropped whenever the id store is saved; saved clicks older than
  90 days are dropped at each check (the Worker deletes its own records after 90 days).

## Health checks

- **System check page** (Services, "Link-click tracker (Cloudflare Worker)"): when tracking is on, it opens the
  Worker's public privacy page once and, with `LINK_TRACKING_READ_KEY`, asks for clicks from "now" once to prove the
  read key works. Each request stops after 5 seconds and is never retried. Off means no request at all.
- **`/healthz`** shows `dependencies.linkTracker` as `off`, `ready` or `not-set-up`, from the settings only. It makes
  no network call and never changes `ok`, so a Worker outage can never stop a ship.

## Trial and going live (your steps)

1. **Development trial, one week.** Keep `ENABLE_LINK_TRACKING=true` in the development `.env`, send real
   applications as usual, and click **Check link clicks** every day or two. Look for:
   - every sent email showing the footnote, with both links opening LinkedIn;
   - scanner hits not being counted (a click within a minute of sending should never show);
   - no recruiter replies mentioning the links.
2. **Switch off quickly if needed:** set `ENABLE_LINK_TRACKING=false` and restart. Drafts already in Gmail keep
   working; new emails get plain links.
3. **Production, after the trial:** ship master as usual, then add the same `LINK_TRACKING_*` lines (same Worker,
   same keys) to the production `.env` and restart production. Production gets its own new files
   (`link-tracking-v1.json`, `link-clicks-v1.json`) in its data folder; no existing file or database changes.
   Development and production use the same Worker, and each only counts clicks on links it gave out.

## Deploying the Worker (you do this once, about 15 minutes)

You need a free Cloudflare account. Claude cannot sign in or create it for you.
Run each block in PowerShell from the repository folder. Nothing here touches the app or its data.

1. Sign in to Cloudflare. A browser window opens; approve it.

```powershell
$ErrorActionPreference='Stop'; Set-Location 'D:\monorepo\NewModularProduct\tools\link-tracker'; npx wrangler@4 login; if ($LASTEXITCODE -ne 0) { throw 'wrangler login failed' }
```

2. Create the click store. Copy the printed `id` into `tools/link-tracker/wrangler.toml`. The id is not a secret. (Already done: the committed file holds the live store id, so skip this step when redeploying.)

```powershell
$ErrorActionPreference='Stop'; Set-Location 'D:\monorepo\NewModularProduct\tools\link-tracker'; npx wrangler@4 kv namespace create CLICKS; if ($LASTEXITCODE -ne 0) { throw 'KV create failed' }
```

3. Make two random keys. Run this twice and keep both values: the first is the signing key, the second the read key. Store them only in your password manager and, in Stage 2, in `.env`.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

4. Give the Worker its three secrets. Each command asks you to paste the value:
   - `SIGNING_KEY`: the first key;
   - `READ_KEY`: the second key;
   - `PROFILE_URL`: your LinkedIn profile address, for example `https://www.linkedin.com/in/<you>/`.

```powershell
$ErrorActionPreference='Stop'; Set-Location 'D:\monorepo\NewModularProduct\tools\link-tracker'; foreach ($name in @('SIGNING_KEY','READ_KEY','PROFILE_URL')) { npx wrangler@4 secret put $name; if ($LASTEXITCODE -ne 0) { throw ('secret failed: ' + $name) } }
```

5. Deploy. It prints the address, for example `https://jobapp-links.<sub>.workers.dev`.
   The first deploy asks for a workers.dev subdomain. It must be unique across Cloudflare and appears in every tracked link, so use a neutral name with digits (the live one is `career-links-5141`). A new subdomain's certificate can take a few minutes to start working.

```powershell
$ErrorActionPreference='Stop'; Set-Location 'D:\monorepo\NewModularProduct\tools\link-tracker'; npx wrangler@4 deploy; if ($LASTEXITCODE -ne 0) { throw 'deploy failed' }
```

6. Check it. Open `<address>/privacy` in a browser: it should show "About these links". Then open `<address>/c/test`: it should say "This link is not valid".

Do not commit `wrangler.toml` with real secrets. It only ever holds the store id, which is not a secret. Do not stage the `.wrangler/` folder that wrangler creates.

## Risks

- Tracked links can slightly raise spam scores, so keep it to two links.
- This is the app's first dependency on an outside service. If the Worker is down, links show an error instead of LinkedIn, so test after every deploy.
- Cloudflare free tier: 100,000 requests and 1,000 stored clicks a day, far above JobApp's volume.
- This is not legal advice. Clicks only, the footnote and the privacy page keep this on the defensible side of UK PECR and UK GDPR.
