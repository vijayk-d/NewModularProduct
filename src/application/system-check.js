// System check: runs read-only checks one after another and groups the results.
// A check that throws is reported as a failure; it never stops the other checks.
export const STATUSES = Object.freeze(['pass', 'warn', 'fail', 'off']);
const RANK = {fail: 3, warn: 2, pass: 1, off: 0};

const clean = item => ({
  status: STATUSES.includes(item?.status) ? item.status : 'fail',
  detail: String(item?.detail || '').slice(0, 1200),
  fix: String(item?.fix || '').slice(0, 600)
});

export async function runSystemCheck(checks, {clock = () => new Date()} = {}) {
  const started = clock();
  const results = [];
  for (const check of checks) {
    let outcome;
    try { outcome = clean(await check.run()); }
    catch (error) { outcome = {status: 'fail', detail: `The check could not run: ${error?.statusCode ? error.message : error?.code || error?.name || 'unexpected error'}.`, fix: ''}; }
    results.push({id: check.id, group: check.group, label: check.label, ...outcome});
  }
  const counts = Object.fromEntries(STATUSES.map(s => [s, results.filter(r => r.status === s).length]));
  const worst = results.reduce((w, r) => RANK[r.status] > RANK[w] ? r.status : w, 'pass');
  const groups = [];
  for (const r of results) {
    let g = groups.find(x => x.group === r.group);
    if (!g) groups.push(g = {group: r.group, items: []});
    g.items.push(r);
  }
  return {checkedAt: started.toISOString(), overall: worst, counts, groups};
}

export function summaryLine(report) {
  const {fail, warn, pass, off} = report.counts;
  if (fail) return `${fail} problem${fail === 1 ? '' : 's'} to fix, ${warn} warning${warn === 1 ? '' : 's'}.`;
  if (warn) return `No problems; ${warn} warning${warn === 1 ? '' : 's'} to review.`;
  return `All ${pass} checks passed${off ? ` (${off} feature${off === 1 ? '' : 's'} switched off)` : ''}.`;
}
