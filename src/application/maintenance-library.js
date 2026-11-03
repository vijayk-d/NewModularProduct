// Read-only reference data for the /maintenance library page.
// Everything here is links and text. Nothing is executed by the server.

const DEFAULT_REPOSITORY = 'https://github.com/vijayk-d/NewModularProduct';
const PORTS = Object.freeze({ development: 3000, production: 3100 });

const PAGES = Object.freeze([
  ['/', 'New application', 'Prepare a CV and cover letter for a role.'],
  ['/applications', 'Saved applications', 'All saved applications and their review state.'],
  ['/outreach-queue', 'Outreach queue', 'Contacts and drafts waiting for review. Nothing sends without confirmation.'],
  ['/outreach-scheduling', 'Outreach scheduling', 'Scheduled outreach and its state.'],
  ['/cover-letter-library', 'Cover-letter library', 'Saved and reusable cover letters.'],
  ['/cv-library', 'CV library', 'Shared CV library (shown only when configured).'],
  ['/evidence-library', 'Evidence library', 'Assignment evidence (needs its configuration; 503 when not set up).'],
  ['/dashboard', 'History dashboard', 'Application history and outcomes.'],
  ['/settings/features', 'Feature toggles', 'Switch features on/off. Production: changes apply after a restart.'],
  ['/maintenance', 'Maintenance library', 'This page.'],
  ['/healthz', 'Health (JSON)', 'Raw health response of this server.'],
]);

const DOCS = Object.freeze([
  ['README.md', 'Start here', 'What the product is and the 5-minute setup.'],
  ['docs/developer-setup.md', 'Developer setup', 'New PC to running development (3000) and production (3100).'],
  ['docs/cicd-guide.md', 'CI/CD and rollback guide', 'How and how often to ship, feature toggles, hotfix, rollback.'],
  ['docs/commands.md', 'Command reference', 'Every routine command in one table.'],
  ['tools/deploy/README.md', 'Release tool', 'How local_delivery.py builds, verifies and promotes releases.'],
  ['NewModularProduct-Architecture.md', 'Architecture', 'Layers, modules and data flow.'],
  ['docs/architecture-decisions.md', 'Architecture decisions', 'Why things are the way they are.'],
  ['NewModularProduct-Full-Migration-Plan.md', 'Migration plan', 'Full migration plan.'],
  ['NewModularProduct-Overall-Plan-Status.md', 'Plan status', 'Where each part of the plan stands.'],
  ['IMPLEMENTATION_PLAN.md', 'Implementation plan', 'Implementation plan.'],
  ['docs/next-development-slices-roadmap.md', 'Roadmap', 'Next development slices.'],
  ['docs/shared-cv-library.md', 'Shared CV library', 'How the CV library is shared between environments.'],
  ['tools/maintenance/README.md', 'Maintenance tools', 'Notes on the maintenance utilities folder.'],
  ['examples/env.development.example.txt', 'Development settings template', 'Every setting the code reads; bootstrap copies it to .env.'],
  ['.github/workflows/ci.yml', 'CI workflow', 'What GitHub Actions runs on every push and pull request.'],
]);

const PS = 'powershell -ExecutionPolicy Bypass -File ';
const UTILITIES = Object.freeze([
  { name: 'Ship to production', path: 'tools/deploy/ship.cmd', command: 'tools\\deploy\\ship.cmd', effect: 'Changes production', note: 'Tests, commits, pushes master, delivers, waits for health. Options: -TestOnly (tests only), -NoPush.' },
  { name: 'Bootstrap development', path: 'tools/maintenance/bootstrap-dev.ps1', command: PS + 'tools\\maintenance\\bootstrap-dev.ps1', effect: 'Local setup', note: 'npm ci, .venv, .env from template, template/inventory, Playwright, smoke tests. Safe to re-run.' },
  { name: 'Repository completeness audit', path: 'tools/maintenance/audit-repo-completeness.ps1', command: PS + 'tools\\maintenance\\audit-repo-completeness.ps1', effect: 'Read-only', note: 'Lists code/docs that exist only on this PC and references to files not in GitHub.' },
  { name: 'Start production safely', path: 'tools/deploy/Start-Production.ps1', command: PS + 'tools\\deploy\\Start-Production.ps1', effect: 'Starts process', note: 'Clears a stale supervisor lock. -StatusOnly checks only; -StopOrphan stops an orphan holding 3100.' },
  { name: 'Release tool', path: 'tools/deploy/local_delivery.py', command: 'py tools\\deploy\\local_delivery.py status', effect: 'Read-only (status/health/plan)', note: 'Subcommands: plan, checkpoint --plan, deliver --ref HEAD, status, health, rollback (code only).' },
  { name: 'CI verification', path: 'tools/deploy/ci_verify.py', command: 'py tools\\deploy\\ci_verify.py', effect: 'Runs tests', note: 'What GitHub Actions runs: copies release files to a temp folder and runs every test.' },
  { name: 'Configure development .env', path: 'tools/maintenance/configure_development_env.py', command: 'py tools\\maintenance\\configure_development_env.py', effect: 'Changes development settings', note: 'Guided development settings.' },
  { name: 'Configure Gmail sending', path: 'tools/maintenance/configure_gmail_sending.py', command: 'py tools\\maintenance\\configure_gmail_sending.py', effect: 'Changes settings', note: 'Writes settings only. Never sends email.' },
  { name: 'Check Gmail signature', path: 'tools/maintenance/check_gmail_signature.mjs', command: 'node tools\\maintenance\\check_gmail_signature.mjs --confirmed', effect: 'Read-only', note: 'Reads the signature from Gmail. Sends nothing.' },
  { name: 'Diagnose Gmail scheduler', path: 'tools/maintenance/diagnose_gmail_scheduler.mjs', command: 'node tools\\maintenance\\diagnose_gmail_scheduler.mjs', effect: 'Read-only', note: 'Explains why scheduled operations are waiting. Retries nothing.' },
  { name: 'Audit local production', path: 'tools/maintenance/audit_local_production.py', command: 'py tools\\maintenance\\audit_local_production.py', effect: 'Read-only', note: 'Checks the production folder layout and state.' },
  { name: 'Configure cloud scheduler', path: 'tools/maintenance/configure_cloud_scheduler.py', command: 'py tools\\maintenance\\configure_cloud_scheduler.py', effect: 'Changes settings', note: 'Development-only cloud scheduling setup.' },
  { name: 'Enable Perplexity runtime', path: 'tools/maintenance/enable_perplexity_runtime.py', command: 'py tools\\maintenance\\enable_perplexity_runtime.py', effect: 'Changes settings', note: 'Sets research/refinement settings. The API key stays in your local .env.' },
  { name: 'Check shared CV library', path: 'tools/maintenance/check-shared-cv-library.mjs', command: 'node tools\\maintenance\\check-shared-cv-library.mjs', effect: 'Read-only', note: 'Confirms both environments see the same CV library.' },
  { name: 'Audit CV library (development)', path: 'tools/maintenance/audit-cv-library-development.mjs', command: 'node tools\\maintenance\\audit-cv-library-development.mjs', effect: 'Read-only', note: 'Checks CV inventory against the CV folder.' },
  { name: 'Cover letter to PDF', path: 'tools/maintenance/Convert-CoverLetterToPdf.ps1', command: PS + 'tools\\maintenance\\Convert-CoverLetterToPdf.ps1', effect: 'Creates file', note: 'Converts a cover letter document to PDF locally.' },
]);

export function buildMaintenanceLibrary(env = process.env) {
  const repository = String(env.NMP_REPOSITORY_URL || DEFAULT_REPOSITORY).replace(/\/+$/, '');
  const environment = String(env.NMP_ENV || 'development');
  const port = Number(env.PORT || 3000);
  const release = String(env.NMP_RELEASE_COMMIT || 'development');
  const releaseKnown = /^[0-9a-f]{7,40}$/i.test(release);
  const host = (p) => `http://127.0.0.1:${p}`;
  return {
    environment,
    port,
    release,
    repository,
    environments: [
      { id: 'development', label: 'Development', port: PORTS.development, url: host(PORTS.development), folder: 'D:\\monorepo\\NewModularProduct', note: 'Your working copy on master or a short feature branch. All integrations off by default.' },
      { id: 'production', label: 'Production', port: PORTS.production, url: host(PORTS.production), folder: 'D:\\NewModularProduct-Production', note: 'Releases built from master by ship. Settings in shared\\config, data in shared\\data.' },
    ],
    verificationNote: 'Ports 3200/3201 are used briefly by release verification. Seeing them busy during ship is normal.',
    pages: PAGES.map(([path, title, note]) => ({ path, title, note })),
    health: Object.values(PORTS).flatMap((p) => [
      { title: `Health ${p}`, url: `${host(p)}/healthz` },
      { title: `Feature toggles ${p}`, url: `${host(p)}/settings/features` },
      { title: `Feature toggles JSON ${p}`, url: `${host(p)}/api/settings/features` },
    ]),
    github: [
      { title: 'Repository', url: repository },
      { title: 'master commits', url: `${repository}/commits/master` },
      { title: 'CI runs (Actions)', url: `${repository}/actions` },
      { title: 'Pull requests', url: `${repository}/pulls` },
      { title: 'Branches', url: `${repository}/branches` },
      ...(releaseKnown ? [
        { title: `Running release ${release.slice(0, 7)}`, url: `${repository}/commit/${release}` },
        { title: 'Changes on master not in this server yet', url: `${repository}/compare/${release}...master` },
      ] : []),
    ],
    docs: DOCS.map(([path, title, note]) => ({ path, title, note, url: `${repository}/blob/master/${path}` })),
    utilities: UTILITIES.map((u) => ({ ...u, url: `${repository}/blob/master/${u.path}` })),
    localOnly: [
      'tools/AssignmentEvidenceLibrary/install.py and tools/WorkflowStabilisation/capture.py are referenced by older commands but are not in GitHub. Run the completeness audit and commit them if you still use them.',
      'Private data stays local by design: .env, shared\\config\\production.env, databases, CVs, output and logs.',
    ],
  };
}

export const HEALTH_TARGETS = Object.freeze({
  development: `http://127.0.0.1:${PORTS.development}/healthz`,
  production: `http://127.0.0.1:${PORTS.production}/healthz`,
});
