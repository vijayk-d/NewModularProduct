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
- **Disclosure footnote,** a small grey line under the signature:
  "Links in this email are counted when clicked so I know they were useful. No other tracking is used."
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
| 1 | Worker, signed links, tests, and this deploy guide | This change |
| 2 | Local id store (new file `link-tracking-v1.json`); links rewritten and footnote added when an email is queued, behind `ENABLE_LINK_TRACKING`; tested by sending to yourself | Next |
| 3 | "Check link clicks" button (read-only, no automatic retries); scanner filtering; clicks shown on Outcome and as an amber "follow up" next step | |
| 4 | Opt-out handling, clean-up, a week's trial in development, then production | |

## Deploying the Worker (you do this once, about 15 minutes)

You need a free Cloudflare account. Claude cannot sign in or create it for you.
Run each block in PowerShell from the repository folder. Nothing here touches the app or its data.

1. Sign in to Cloudflare. A browser window opens; approve it.

```powershell
$ErrorActionPreference='Stop'; Set-Location 'D:\monorepo\NewModularProduct\tools\link-tracker'; npx wrangler@4 login; if ($LASTEXITCODE -ne 0) { throw 'wrangler login failed' }
```

2. Create the click store. Copy the printed `id` into `tools/link-tracker/wrangler.toml`, replacing `REPLACE_WITH_KV_NAMESPACE_ID`. The id is not a secret.

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
