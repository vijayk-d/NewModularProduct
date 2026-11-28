# Letter Keywords check

**Keywords**, in the cover-letter toolbar, compares what the advert asks for with three things: your letter, your evidence and your selected CV. It is free and runs locally. The only paid part is reading the advert with AI, which happens once per application.

## What it reads

- **The advert.** The AI reading is used when it is available. Otherwise the built-in reader is used, which works as follows:
  - It recognises named certifications, tools, methods, skills and sectors, and two hiring conditions: **security clearance** (SC, DV, BPSS, NPPV, TS) and **right to work in the UK**.
  - Advert filler is ignored, for example "highest standards", "enable immediate engagement" or "send your CV".
  - Phrases it does not know are treated as a best guess. They never count as Essential.
- **Your evidence**, checked first: selected achievements, the tailored CV, saved certifications and approved scenarios.
- **Your whole selected CV**, line by line. This is how a line such as "Eligible for SC clearance: previously SC cleared…" or a PRINCE2 mention anywhere in the CV is found.

## How it judges

| Situation | What you see |
|---|---|
| The advert's words are in the letter | **In the letter**. If it is a certification, sector, qualification or clearance that nothing you supplied shows, the chip is marked ⚠ and a "Check:" step asks you to keep it only if it is true. Naming the employer's own sector is fine. |
| You hold an **equivalent** credential (PRINCE2 or APM PMQ for PMP, PSM for CSM, MSP for PgMP) | Covered, marked ≈ if the letter names it. Otherwise the step says "you hold PRINCE2, not PMP. Name PRINCE2 as your equivalent; never claim PMP." Polishing is told the same thing. |
| Your evidence **shows** a broader requirement through a specific practice (Scrum or SAFe for Agile, PRINCE2 for Project management, "line managed a team" for Team leadership) | "Missing, backed by your evidence", with the line it comes from. |
| A clearance or right-to-work requirement | Listed first. Your own CV line is quoted, to state in the closing paragraph. If your CV and evidence say nothing about it, you are asked to check you are eligible before applying. |

## Reading the advert again

If the AI reading failed, the built-in reading is used and nothing retries automatically. The panel then offers **Read the advert with AI again**. That is one small paid request, made only when you click and confirm. A saved AI reading is never paid for twice.

## Where it lives

- `src/domain/keywords/advert-requirements.js`: vocabulary, filler, related and equivalent terms.
- `src/application/letter-keywords.js`: the report and the polishing hints.
- `src/domain/cv/cv-facts.js` (`cvEvidenceLines`): CV lines used as evidence.
- `src/interfaces/http/letter-keyword-controls.js`: the panel.
