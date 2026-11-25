// What happened after an application was sent. Recorded by the owner; never inferred or sent anywhere.
export const OUTCOMES = Object.freeze([
  {id: 'no_reply', label: 'No reply', responded: false},
  {id: 'recruiter_replied', label: 'Recruiter replied', responded: true},
  {id: 'interview', label: 'Interview', responded: true},
  {id: 'rejected', label: 'Rejected', responded: true},
  {id: 'offer', label: 'Offer', responded: true},
  {id: 'withdrawn', label: 'Withdrawn', responded: true}
]);
const BY_ID = new Map(OUTCOMES.map(o => [o.id, o]));
export const outcomeLabel = id => BY_ID.get(id)?.label || '';
export const MAX_NOTE = 300;

const fail = message => { throw Object.assign(new Error(message), {statusCode: 400, code: 'OUTCOME_INVALID'}); };
const day = date => date.toISOString().slice(0, 10);

// Checks one owner entry: a known outcome, a real calendar date not in the future, and an optional short plain note.
export function validateOutcome({outcome, occurredOn, note = ''} = {}, {now = new Date()} = {}) {
  if (!BY_ID.has(outcome)) fail('Choose one of: ' + OUTCOMES.map(o => o.label).join(', ') + '.');
  const date = String(occurredOn || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || day(new Date(date + 'T00:00:00Z')) !== date) fail('Enter the date as a real calendar date.');
  if (date > day(now)) fail('The date cannot be in the future.');
  if (date < '2020-01-01') fail('The date is too far in the past.');
  const text = String(note ?? '').replace(/\s+/g, ' ').trim();
  if (text.length > MAX_NOTE) fail(`Keep the note to ${MAX_NOTE} characters.`);
  if (/<\/?[a-z][^>]*>/i.test(text)) fail('The note must be plain text.');
  return {outcome, occurredOn: date, note: text};
}

// The current outcome is the latest by date; for the same date, the one recorded last.
export function currentOutcome(events = []) {
  return [...events].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.recordedAt - b.recordedAt || a.id - b.id).at(-1) || null;
}

export const hasResponse = event => Boolean(event && BY_ID.get(event.outcome)?.responded);

// A recruiter reply moves the outcome forward, never back: "Recruiter replied" or "Rejected" is recorded only when the
// current outcome is earlier (none, No reply, or Recruiter replied before a rejection). Interview, Offer and Withdrawn stay.
const STAGE = {no_reply: 0, recruiter_replied: 1, rejected: 2, interview: 3, offer: 4, withdrawn: 4};
export function replyOutcomeId(topicIds = []) { return topicIds.includes('not-progressing') ? 'rejected' : 'recruiter_replied'; }
export function replyMovesOutcome(current, next) { return !current || (STAGE[next] ?? 0) > (STAGE[current.outcome] ?? 0); }
