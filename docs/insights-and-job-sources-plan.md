# Application insights engine and job sources beyond LinkedIn — plan

Status: proposal for the owner's review, 18 November 2026. Nothing here is built yet.

## Part A — Application insights engine

### Goal
Learn from every application which choices lead to replies and interviews, then feed that back as **suggestions** (never silent changes). Everything stays local: no network calls, no paid AI calls and no personal data leaving the machine.

### Data the app already keeps (no new collection needed)
| Store | Useful signal |
|---|---|
| `application-reviews-v1.db` | Job description, organisation, job title, chosen CV, ATS score, letter versions, tone, length, model, personal instructions, scenarios used, refinement history |
| `job-imports-v1.db` | Advert source, received date, advertiser |
| `outreach.db` | Who was emailed, when, sent versus draft, repeat sends |
| `workflow-automation-v1.db` | Portal pack exports, organisation research, follow-ups due |
| `cv-tailoring-v1.db` | Tailored versions, polish attempts, ATS before/after, the CV version emailed |
| Application intelligence store | CV assessments per job |

### What is missing: the outcome
Without outcomes the engine can only describe activity, not learn. So the first step is outcome capture:
- **Outcome buttons** on each application: No reply, Recruiter replied, Interview, Rejected, Offer, Withdrawn. Each records a date.
- **Optional, later:** a read-only Gmail check that suggests "reply received" for you to confirm. It never sends anything.

### Phases
1. **Outcome capture** (small).
   - Store outcomes in a new file, `application-insights-v1.db`. No existing schema changes.
   - Show the outcome on the dashboard.
2. **Feature snapshot** (small–medium).
   - A local job runs at start-up and after each save. It builds one row per application, using fields that already exist:
     - role family and seniority; sector and organisation size;
     - channel: portal, email or both;
     - days from advert to application;
     - CV used; tailored or not; ATS before and after;
     - letter length, tone and model;
     - scenarios and achievements used;
     - cost of paid calls.
   - It runs in the background, makes no network calls and can be rebuilt at any time.
3. **Insights page** (medium).
   - Response and interview rates by CV, role family, tone, length, tailored versus not, and ATS band.
   - Advert keywords that keep appearing but are missing from your CVs. This is a skills gap list to improve the CV library honestly.
   - Which scenarios and achievements appeared in applications that reached interview.
   - Spend per application and per interview.
   - A pattern is shown only once a group has at least 10 outcomes. It is labelled as a correlation, not a cause.
4. **Suggestions back into the workflow** (medium).
   - At preparation: "Your PM CV has a 30% reply rate for this role family; your SM CV 10%".
   - Suggested tone and length, and keyword gaps flagged before building the tailored CV.
   - Each suggestion is a hint with the evidence count; you accept or ignore it.

### Guardrails
- Local only. New database file only. No automatic retries and no automatic paid calls.
- It never rewrites scenario wording or CV content. It only suggests.
- Letters stay evidence-led: insights may rank evidence, never invent it.

## Part B — Sources beyond LinkedIn

### What already works for any job site
The preparation form accepts any advert URL and a pasted job description. The letter, tailored CV, ATS match, export pack and Save to folder all work the same way.

### What is LinkedIn-only today
- The Tampermonkey advert reader and the job import API, which only accepts `linkedin.com/jobs/view/<id>`.
- Advert grouping and status, which are keyed on the LinkedIn job ID.
- The contact bridge and the company People search links.

### Minor improvements, in recommended order
1. **"Paste any advert" import.**
   - Any https URL plus pasted text becomes a job import with its source site recorded.
   - Its ID is a hash of the normalised URL, so advert status and follow-ups work for every site.
2. **Application questions helper.**
   - For portal questions with word or character limits, such as Serco's "250 words" or "250 characters", or Civil Service Success Profiles behaviour statements.
   - Evidence-led STAR answers from the CV and approved scenarios, with an exact counter.
3. **Readers for UK job boards.** These use the same minimal payload as the LinkedIn reader:
   - Indeed UK, Reed, Totaljobs, CV-Library, Guardian Jobs, jobs.ac.uk;
   - Civil Service Jobs and NHS Jobs.
4. **Employer career portals** (Workday, Greenhouse, Lever, SmartRecruiters, SuccessFactors, iCIMS, Taleo).
   - A reader for the advert page.
   - A "portal application" channel that tracks the pack you uploaded and the questions you answered.
5. **Recruitment agencies.** Mark a contact as an agency recruiter (for example Hays or Michael Page), use a letter variant for agencies, and track the client separately from the agency.
6. **Job alert emails.** A read-only Gmail label import turns alert emails into imports to review. It never sends anything.
7. **Speculative applications.** Organisation research plus a target role, with no advert: a letter built from research and evidence only.

## Recommended next steps
1. Outcome capture (A1), because every later insight depends on it.
2. "Paste any advert" import (B1), a small change that removes most of the LinkedIn dependency.
3. Application questions helper (B2), which is already on the roadmap.
4. Then the feature snapshot and insights page (A2–A3), once about 20 outcomes have been recorded.
