# Contact email presentation v1

Presentation-only: inferred-origin email inputs are light amber (#fff4d6); manually entered-origin inputs are pale blue (#eaf3ff). Those origin labels no longer take a permanent line under every field; source text remains in the existing small element because business logic reads it. It stays available through accessible description, hover/focus detail and full-address/native title. Other sources keep existing neutral/text treatment.

Origin is NOT verification. Manual is not automatically verified; a historically inferred address may separately have recorded verification. No source value/verification flag/address/role is changed by the styling helper.

The effective desktop v4 layout uses 38ch + 22px for BOTH email and role (older percentage rules are overridden). New email width is 28.5ch + 16.5px, exactly 75% of that budget; role is 47.5ch + 27.5px, receiving the released 25%. Combined width remains 76ch + 44px. Person/checkbox/actions and <=900px stacked layout are unchanged. Width overrides are scoped and more specific than the existing important v4 rules.

Updated hook points: initial row, manual edit, Suggest email, inferred-domain refresh, duplicate-row source reconciliation. Hidden source text still powers existing values/remember/domain logic; no API payload change. Queue, inference, verification and sending logic remain.

Run Node tests and isolated Playwright fixture (no app web server or real contacts):
node --test tests/application/contact-email-presentation.test.js tests/application/outreach-simple-workflow.test.js tests/application/contact-workflow-policy.test.js tests/application/bulk-workspace-isolation.test.js tests/application/workflow-presentation-tidy.test.js tests/regression/contact-workflow.test.js
node node_modules/@playwright/test/cli.js test --config tools/maintenance/playwright.contact-email-presentation.config.mjs

Browser suite is synthetic and blocks network. It checks actual computed colours, hover/focus source details, 25% pixel-width change, invariant combined width and small-screen values. Uses existing bundled Chromium or standard Edge, never an automatic browser download.

Only current candidate contact fields are changed, not read-only queue/history source text or status messages. Personal values are not truncated. No database migration, provider/Gmail call, env or production change. Hard-refresh after development restart. Browser/Windows checks remain local acceptance before any deployment.
