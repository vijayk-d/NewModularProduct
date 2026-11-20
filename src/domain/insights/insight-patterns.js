// Insights phase 3: response and interview rates per choice (CV, role family, tone, length, tailoring, ATS band...).
// Pure. Learned only from your own feature snapshot rows. A rate is shown only once a group has MIN_GROUP_OUTCOMES
// applications with an outcome, and every pattern is a correlation, not a cause.
import {hasResponse} from './application-outcome.js';

export const MIN_GROUP_OUTCOMES = 10;
const interviewed = outcome => outcome === 'interview' || outcome === 'offer';

export function atsBand(score) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) return 'Not scored';
  const s = Number(score);
  return s >= 85 ? '85 and above' : s >= 70 ? '70–84' : s >= 50 ? '50–69' : 'Below 50';
}

const RELATIONSHIP = {'direct-employer': 'Employer', 'recruitment-intermediary': 'Agency', unknown: 'Unknown', 'not-set': 'Not set'};
export const DIMENSIONS = Object.freeze([
  {id: 'cv', label: 'CV used', value: r => r.cvCode || 'Not recorded'},
  {id: 'roleFamily', label: 'Role family', value: r => r.roleFamily || 'other'},
  {id: 'seniority', label: 'Level', value: r => r.seniority || 'mid'},
  {id: 'letterTone', label: 'Letter tone', value: r => r.letterTone || 'professional'},
  {id: 'letterLength', label: 'Letter length', value: r => r.letterLength || 'standard'},
  {id: 'tailored', label: 'Tailored CV', value: r => r.cvTailored ? 'Tailored' : 'Not tailored'},
  {id: 'atsBand', label: 'ATS score band', value: r => atsBand(r.atsScore)},
  {id: 'channel', label: 'Channel', value: r => ({email: 'Email', portal: 'Portal', both: 'Email and portal', none: 'Not recorded'}[r.channel] || 'Not recorded')},
  {id: 'relationship', label: 'Advertiser', value: r => RELATIONSHIP[r.advertiserRelationship] || 'Not set'}
]);

function tally(rows) {
  const t = {applications: rows.length, decided: 0, responded: 0, interviews: 0};
  for (const r of rows) {
    if (!r.outcome) continue;
    t.decided++;
    if (hasResponse({outcome: r.outcome})) t.responded++;
    if (interviewed(r.outcome)) t.interviews++;
  }
  const ready = t.decided >= MIN_GROUP_OUTCOMES;
  return {...t, ready, needed: ready ? 0 : MIN_GROUP_OUTCOMES - t.decided,
    responseRate: ready ? t.responded / t.decided : null, interviewRate: ready ? t.interviews / t.decided : null};
}

// One group per value of each dimension, largest first. Overall is the baseline every group is compared with.
export function insightPatterns(rows = []) {
  const overall = tally(rows);
  const dimensions = DIMENSIONS.map(d => {
    const groups = new Map();
    for (const r of rows) { const v = String(d.value(r)); if (!groups.has(v)) groups.set(v, []); groups.get(v).push(r); }
    const list = [...groups].map(([value, members]) => ({value, ...tally(members)}))
      .map(g => ({...g, versusOverall: g.ready && overall.ready ? Math.round((g.responseRate - overall.responseRate) * 100) : null}))
      .sort((a, b) => b.decided - a.decided || b.applications - a.applications || a.value.localeCompare(b.value));
    return {id: d.id, label: d.label, groups: list, readyGroups: list.filter(g => g.ready).length};
  });
  // Evidence that appeared in applications that reached interview or offer, most often first.
  const counts = new Map();
  for (const r of rows) if (interviewed(r.outcome)) for (const key of new Set(r.evidenceKeys || [])) counts.set(key, (counts.get(key) || 0) + 1);
  const interviewEvidence = [...counts].map(([key, interviews]) => ({key, interviews})).sort((a, b) => b.interviews - a.interviews || a.key.localeCompare(b.key));
  return {overall, dimensions, interviewEvidence, minGroupOutcomes: MIN_GROUP_OUTCOMES};
}
