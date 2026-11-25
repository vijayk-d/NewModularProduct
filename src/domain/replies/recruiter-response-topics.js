// What a recruiter's reply is about. Applying is rarely the only thing they answer: they ask about salary, notice,
// right to work, location, a call, an updated CV, or say the role has moved on. Free, local and pure: the reply
// assistant ticks the topics it finds, asks for your answer to each, and summarises what recruiters have said so far.

// Each topic: what it means, the answer it needs from you (blank when none), and the cues that find it.
export const RESPONSE_TOPICS = Object.freeze([
  {id: 'apply-online', label: 'Asked you to apply online', answer: '',
    cues: [/apply (?:online|directly|via|through|on)/i, /online application/i, /(?:careers?|jobs?) (?:page|site|portal)/i, /application (?:portal|form|system)/i, /\bATS\b/, /submit (?:your|an) application/i, /(?:workday|greenhouse|lever|taleo|smartrecruiters|icims)\b/i]},
  {id: 'salary', label: 'Salary or rate expectation', answer: 'Your expectation (for example £75,000–£85,000 base, or a day rate)',
    cues: [/salary/i, /\bexpectations?\b/i, /compensation/i, /remuneration/i, /\bpackage\b/i, /day ?rate/i, /\brate\b.*\b(?:day|hour)\b/i, /(?:current|desired) (?:pay|earnings)/i]},
  {id: 'notice', label: 'Notice period or start date', answer: 'Your notice period or earliest start date',
    cues: [/notice period/i, /\bnotice\b/i, /availability/i, /start date/i, /when (?:could|can|would) you (?:start|join)/i, /available to start/i]},
  {id: 'right-to-work', label: 'Right to work or sponsorship', answer: 'Your right to work in the UK',
    cues: [/right to work/i, /sponsor(?:ship)?/i, /\bvisa\b/i, /eligib(?:le|ility) to work/i, /work permit/i, /security clearance|\bSC\b clear|\bDV\b clear/i]},
  {id: 'location', label: 'Location, office days or travel', answer: 'Where you are based and the office pattern you can do',
    cues: [/hybrid/i, /on[- ]?site/i, /in the office/i, /office (?:days|based)/i, /days (?:a|per) week/i, /relocat/i, /commut/i, /\btravel\b/i, /where are you based/i]},
  {id: 'call', label: 'A call or interview', answer: 'Times you are free (for example Tue or Wed after 2pm)',
    cues: [/\bcall\b/i, /\bchat\b/i, /\binterview/i, /\bschedule\b/i, /\bTeams\b/, /\bZoom\b/i, /calendly/i, /speak (?:with|to) you/i, /(?:are|is) you free/i, /\bslots?\b/i]},
  {id: 'cv', label: 'Asked for your CV or more detail', answer: '',
    cues: [/\b(?:updated |latest |copy of (?:your )?)?CV\b/, /r[ée]sum[ée]/i, /portfolio/i, /more (?:detail|information) (?:on|about) your/i, /tell me (?:a bit )?more about/i]},
  {id: 'forwarded', label: 'Passed to the hiring manager', answer: '',
    cues: [/(?:passed|forwarded|shared|sent) (?:on |this |your [a-z]+ )*(?:to|with) the (?:hiring|recruiting) (?:manager|team)/i, /(?:passed|forwarded) (?:it |this |your [a-z]+ )?on/i, /will be in touch/i, /get back to you/i, /keep you (?:posted|updated)/i]},
  {id: 'not-progressing', label: 'Not progressing or role filled', answer: '',
    cues: [/unfortunately/i, /not (?:be )?(?:progress|moving forward|taking (?:your|this) application)/i, /unsuccessful/i, /other candidates/i, /(?:role|position|vacancy) (?:has been|is now|was) (?:filled|closed|withdrawn|on hold)/i, /decided not to/i, /closer match/i]}
]);
const BY_ID = new Map(RESPONSE_TOPICS.map(t => [t.id, t]));
export const topicById = id => BY_ID.get(id) || null;

// Their own words only: quoted earlier messages and signatures are left out, so your first email is never read as theirs.
export function ownPart(message) {
  const lines = String(message || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue;
    if (/^\s*On .{3,120} wrote:\s*$/.test(line) || /^\s*-{2,}\s*Original Message/i.test(line) || /^\s*From:\s.+@/.test(line)) break;
    out.push(line);
  }
  return out.join('\n');
}

// Topic ids found in their message, in RESPONSE_TOPICS order.
export function detectTopics(message) {
  const text = ownPart(message);
  if (!text.trim()) return [];
  return RESPONSE_TOPICS.filter(t => t.cues.some(c => c.test(text))).map(t => t.id);
}

// Across every reply received: how often each topic comes up, most frequent first (topics never seen are left out).
export function responsePatterns(messages = []) {
  const counts = new Map(), list = (Array.isArray(messages) ? messages : []).filter(m => String(m || '').trim());
  for (const m of list) for (const id of detectTopics(m)) counts.set(id, (counts.get(id) || 0) + 1);
  return {total: list.length, topics: RESPONSE_TOPICS.filter(t => counts.has(t.id)).map(t => ({id: t.id, label: t.label, count: counts.get(t.id)})).sort((a, b) => b.count - a.count)};
}
