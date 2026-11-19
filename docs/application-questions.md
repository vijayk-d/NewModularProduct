# Application questions helper and advertiser relationship

## Application questions

**Where:** the **Application questions** section on each application page, below Tailored CV.

**What it does:** answers a question from an application portal ("In 250 words, describe…") within an exact limit, using only this application's evidence.

**Evidence used:**
- the achievements selected for this application;
- the latest tailored CV (summary, key achievements and employer bullets), if you built one;
- the approved scenarios chosen for letter polishing (their approved wording only).

**Steps:**
1. Paste the question and set the limit, in **words** or **characters (including spaces)**.
2. **Draft from evidence (free):** the best-matching evidence lines, whole sentences only, fitted within the limit. Unrelated lines are used only if nothing matches the question at all. Nothing is invented.
3. Optionally, **Estimate: write with AI**, then **Write with AI (paid, one request)**.
   - The estimate sends nothing.
   - The request sends only the question, the limit, the job summary, your evidence lines and the current draft.
   - No web search and no retry. It uses the same setting and models as letter polishing.
4. Edit freely. A live counter shows used, left or over, with both word and character counts. **Trim to the limit** shortens at a sentence boundary, and only when you click it.
5. **Check figures** names any number, % or £ that isn't in your evidence.
6. **Copy answer**, and **Save answer** to keep it with the application. Saved answers can be copied, edited again or removed (two clicks, no dialog).

**Storage:** a new `<state>/application-answers-v1.db`. No existing schema is changed.

## Advertiser relationship for the next polish

The **Direct employer / Recruitment agency / Unknown** choice above the Polish button is now worked out from evidence the app already holds.

| Evidence | Points to |
|---|---|
| The advert says "our client", "on behalf of", "acting as an employment agency or business", "partnered with", or describes an unnamed "leading" organisation | Agency (strong) |
| The LinkedIn advert was posted by a known agency, or a name with agency words (recruitment, resourcing, staffing, search, …) | Agency (strong) |
| The LinkedIn advert was posted by the same organisation you are applying to | Employer |
| The LinkedIn advert was posted by a different organisation | Agency (weak) |
| A poster's headline: recruiter or talent role at the same organisation (in-house), or elsewhere | Employer / Agency |
| Organisation research describes a recruitment or staffing firm | Agency |
| "Join our team", "our values" or "equal opportunities employer" wording | Employer (weak) |
| Your earlier choice for the same advertiser | That choice (strong) |

**Rules:**
- **Your choice wins.** Your explicit choice (the one you polished with, or an earlier Direct or Agency setting) is never overridden. When the evidence disagrees, the page says so.
- **Preselection is confident only.** An undecided application preselects the suggestion only at medium or high confidence; otherwise it stays **Unknown**, which keeps the wording neutral.
- **The reasons are listed under the choice.**
- **Choices are remembered.** Polishing with a relationship remembers it for that advertiser, in a new table in `workflow-automation-v1.db`, and the next application to the same advertiser uses it.
- No paid call is made to work this out.
