# NewModularProduct — Overall Activity Plan and Status

**Status date:** 30 September 2026  
**Current verified baseline:** 31 passing tests, 0 failures (`node --test`)  
**Latest committed workflow checkpoint:** `f8ccd33 feat: compose pure application preparation workflow`

## Delivery roadmap

| # | Activity | Goal / deliverable | Status | Evidence / notes |
|---:|---|---|---|---|
| 0 | Establish safe migration boundary | Use sanitized legacy source only; exclude secrets, actual CVs, local configuration, generated outputs, outreach, UI, and integrations from the first slices | Complete | Migration work used focused source/test inspection and synthetic fixtures only |
| 1 | Discover verified legacy contracts | Extract behavior from source and Node tests for parser, ATS scoring, CV selection, path selection, and cover-letter generation | Complete | Replaced earlier inferred summaries with direct source/test-backed contracts |
| 2 | Set up modular Node project | Create ESM project, Node test command, source/test layout, Git hygiene, ignore rules, line-ending policy | Complete | `package.json`, `.gitignore`, `.gitattributes`; `node --test` |
| 3 | Implement shared text primitives | Provide normalization, tokenization, uniqueness, and overlap operations | Complete | `src/domain/shared/text-normalization.js` |
| 4 | Implement JD parsing | Convert raw job text into structured role, keywords, methods, location, domain, seniority, and clearance signals | Complete | `parseJobDescription()` plus contract tests |
| 5 | Implement ATS assessment | Score an in-memory CV against a parsed JD and return explanation components/suggestions | Complete | `scoreCvAgainstJd()` plus scoring tests |
| 6 | Implement CV ranking and best/alternative selection | Rank candidates and return a recommendation | Complete | `rankCvCandidates()` and `selectCv()`; preferred-code tie-breaker corrected intentionally |
| 7 | Implement selected-path candidate policy | Narrow inventory by path identifiers and synthesize metadata for unknown selected identifiers without I/O | Complete | `selectCvsByPath()`; Windows path semantics are explicit and tested |
| 8 | Implement cover-letter domain | Fill templates, validate output, generate draft, clean citation markers, add ATS paragraph, and highlight terms | Complete | Explicit template required; candidate details supplied as inputs rather than hard-coded |
| 9 | Compose pure application workflow | Provide a single in-memory operation from JD input to CV recommendation and validated cover letter | Complete | `prepareApplication()` plus two end-to-end synthetic tests |
| 10 | Write/update architecture documentation | Maintain high-level/low-level design, diagrams, contracts, boundaries, and roadmap | Complete, needs small refresh | Markdown document exists; update baseline from 29 to 31 tests and mark `prepareApplication` implemented |
| 11 | Add JSON CLI interface | Read one JSON request from stdin; run application workflow; emit one JSON result to stdout; report errors to stderr | Ready to start | Design and code plan prepared; not yet implemented or tested |
| 12 | Validate CLI end-to-end | Add CLI command tests and a synthetic stdin/stdout smoke test | Not started | Target after Activity 11: 36 tests total expected |
| 13 | Commit CLI checkpoint | Commit only CLI adapter, CLI tests, and package script change | Not started | Planned commit: `feat: add JSON application preparation CLI` |
| 14 | Define infrastructure ports | Specify stable interfaces for template storage, CV inventory, and document text extraction | Planned | Must stay outside `src/domain` |
| 15 | Add template-loading adapter | Load an explicit named template from a controlled source and pass it to pure application workflow | Planned | Prefer this before CV document ingestion |
| 16 | Add CV inventory adapter | Load candidate metadata from an approved storage format and map it to domain input shape | Planned | No real personal data until privacy/storage policy is decided |
| 17 | Add document text extraction adapter | Extract text from approved CV documents with error handling, path validation, and optional caching | Planned | Requires careful sensitive-data handling; do not put in domain |
| 18 | Add a human-facing interface | Choose CLI enhancements, HTTP API, or web UI after the JSON boundary is stable | Planned | Interface should call application services, never domain internals directly |
| 19 | Add optional external research/refinement ports | Integrate company research or LLM refinement through explicit interfaces and audit/error controls | Deferred | Requires explicit provider, privacy, cost, and secret-management design |
| 20 | Add outreach/email only with safety design | Create drafts/queues first; require explicit confirmation before any send operation | Deferred | Separate high-risk slice; credentials, consent, recipient resolution, and audit trail required |

## Current architecture state

```text
Implemented and tested

Job-description text
  → parseJobDescription
  → selectCvsByPath (optional path subset)
  → scoreCvAgainstJd
  → rankCvCandidates / selectCv
  → generateCoverLetter / validateCoverLetter
  → prepareApplication

Next boundary

JSON stdin
  → CLI adapter
  → prepareApplication
  → JSON stdout
```

## Completed checkpoints

| Commit | Checkpoint |
|---|---|
| `aa70cce` | Pure JD parsing and CV ranking core |
| `694f7eb` | `.gitignore` protection |
| `bdd32a1` | Text-file line-ending policy |
| `7a2fdb1` | Pure CV selection policy |
| `48fff66` | CV path selection policy |
| `f8ccd33` | Pure application preparation workflow |
| Cover-letter checkpoint | Implemented and tested; verify its exact commit hash locally if needed |

## Decision gates

1. **Before Activity 11:** Confirm the architecture document is refreshed to the 31-test baseline.
2. **Before Activities 14–17:** Decide where candidate data may be stored, who can access it, and whether it may contain sensitive personal information.
3. **Before Activity 19:** Select providers and define data minimization, cost limits, retry behavior, logging, and secret storage.
4. **Before Activity 20:** Require a separate communication-safety design with explicit human approval for every send action.

## Recommended immediate next action

Implement **Activity 11: JSON CLI interface**, then run its command tests and a synthetic stdin/stdout smoke test. This makes the completed pure workflow usable without widening the trust boundary.
