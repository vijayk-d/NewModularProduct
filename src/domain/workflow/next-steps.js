// Next step for each application, as Green / Amber / Red, so you always know what to click next.
//   Red: act now (a send is uncertain or failed, a reply is waiting for your answer, an interview is coming).
//   Amber: a next step is ready (send what is queued, put a reply in Gmail, follow up, find contacts, finish idle work).
//   Green: nothing for you to do (waiting for replies, or closed).
// Pure: built only from what the app already stores. Nothing is sent or changed.

export const LEVELS = Object.freeze({red: 3, amber: 2, green: 1});
export const FOLLOW_UP_DAYS = 5, IDLE_DAYS = 14, WINDOW_DAYS = 60, CLICK_DAYS = 14;
const DAY = 864e5;
const CLOSED = new Set(['rejected', 'offer', 'withdrawn']);
const time = v => { const n = typeof v === 'number' ? v : Date.parse(v || ''); return Number.isFinite(n) ? n : 0; };
const days = (now, at) => Math.floor((now - at) / DAY);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// review: {id, jobTitle, organisation, updatedAt}; queue / sent / replies: this application's rows; outcome: its current one;
// lastClickAt: when someone last clicked a tracked link in this application's emails (from Check link clicks).
// Returns null when the application is old and quiet (nothing to show).
export function nextStepFor({review, queue = [], sent = [], replies = [], outcome = null, lastClickAt = '', now = Date.now()}) {
  const id = String(review?.id || ''), app = `/applications/${encodeURIComponent(id)}`;
  const name = [review?.organisation, review?.jobTitle].filter(Boolean).join(' · ') || 'Untitled application';
  const step = (level, action, href, why) => ({reviewId: id, name, level, action, href, why});
  const lastSent = Math.max(0, ...sent.filter(s => s.status === 'sent' || !s.status).map(s => time(s.sentAt)));
  const lastTouch = Math.max(time(review?.updatedAt), lastSent, ...queue.map(q => time(q.updatedAt || q.createdAt)), ...replies.map(r => Number(r.internalDate) || 0));

  const uncertain = queue.filter(q => /unknown|failed/.test(String(q.status || '')));
  if (uncertain.length) return step('red', `Check ${plural(uncertain.length, 'uncertain or failed send')}`, '/outreach-queue', 'Inspect Gmail before doing anything else; nothing is retried automatically.');
  const waiting = replies.filter(r => (r.status || 'new') === 'new');
  if (waiting.length) {
    const who = waiting[0].fromName || waiting[0].fromAddress || 'them';
    return step('red', waiting.length === 1 ? `Answer ${who}'s reply` : `Answer ${plural(waiting.length, 'reply', 'replies')}`, app + '#recruiter-reply', 'A recruiter replied and has no answer from you yet.');
  }
  if (outcome?.outcome === 'interview' && days(now, time(outcome.occurredOn)) <= 14) return step('red', 'Prepare for the interview', app, 'Interview recorded ' + outcome.occurredOn + '.');
  if (outcome && CLOSED.has(outcome.outcome)) return days(now, lastTouch) > WINDOW_DAYS ? null : step('green', `Closed: ${outcome.label || outcome.outcome}`, app + '#application-outcome', 'Nothing to do.');

  const drafted = replies.filter(r => r.status === 'drafted');
  if (drafted.length) return step('amber', `Put your reply to ${drafted[0].fromName || drafted[0].fromAddress || 'them'} in Gmail`, app + '#recruiter-reply', 'Your reply is drafted here but not yet in Gmail.');
  const unsent = queue.filter(q => !/sent|unknown|failed|cancel|skip|remov/.test(String(q.status || 'new')));
  if (unsent.length) return step('amber', `Send ${plural(unsent.length, 'queued email')}`, '/outreach-queue', 'Contacts are queued but not sent.');
  if (lastSent) {
    const d = days(now, lastSent), responded = outcome && outcome.outcome !== 'no_reply';
    if (d > WINDOW_DAYS) return null;
    const clickedAt = time(lastClickAt);
    if (!responded && clickedAt > lastSent && days(now, clickedAt) <= CLICK_DAYS) {
      const c = days(now, clickedAt);
      return step('amber', `Follow up: link clicked ${c === 0 ? 'today' : plural(c, 'day') + ' ago'}`, app + '#application-outcome', 'Someone opened the LinkedIn link in your email but has not replied; a short follow-up now is timely.');
    }
    if (!responded && d >= FOLLOW_UP_DAYS) return step('amber', `Follow up: no reply for ${plural(d, 'day')}`, app + '#application-outcome', 'Send a short follow-up, or record the outcome.');
    return step('green', responded ? `Waiting: ${outcome.label || 'replied'}` : `Waiting for replies (sent ${d === 0 ? 'today' : plural(d, 'day') + ' ago'})`, app + '#application-outcome', 'Nothing to do yet.');
  }
  const idle = days(now, lastTouch);
  if (idle > WINDOW_DAYS) return null;
  if (idle >= IDLE_DAYS) return step('amber', `Finish or close: untouched for ${plural(idle, 'day')}`, app, 'Queue the email, or record Withdrawn so it stops asking.');
  return step('amber', 'Find contacts and queue the email', app + '#email-domain-resolution', 'The letter is saved but nobody has been emailed yet.');
}

// The bar's pill: the most urgent level, counts, and the list in order (red, then amber, then green; newest first).
export function summariseNextSteps(steps = []) {
  const list = steps.filter(Boolean).sort((a, b) => LEVELS[b.level] - LEVELS[a.level]);
  const count = level => list.filter(s => s.level === level).length;
  const red = count('red'), amber = count('amber');
  return {level: red ? 'red' : amber ? 'amber' : 'green', red, amber, green: count('green'), steps: list,
    label: red ? `${red} urgent${amber ? ` · ${amber} to do` : ''}` : amber ? `${amber} to do` : 'All clear'};
}
