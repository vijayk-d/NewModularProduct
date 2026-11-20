// Outreach safety gate: a letter can be queued, drafted, sent or scheduled only once a polished proposal has been applied
// ("Use proposal as current draft"), or when you deliberately ticked "Send without polishing" for that application.
export function polishGate(review) {
  const applied = Array.isArray(review?.refinementHistory) && review.refinementHistory.some(h => h && h.appliedAt);
  const pending = Boolean(String(review?.refinementProposal?.proposedDraft || '').trim());
  const overridden = review?.sendWithoutPolish === true;
  const allowed = applied || overridden;
  let message = '';
  if (!allowed && !review) message = 'The saved application for this row is no longer available, so its letter cannot be checked. Remove the row, then add it again from the application.';
  else if (!allowed) message = pending
    ? 'A polished proposal is waiting. Click "Use proposal as current draft" on the application before drafting or sending.'
    : 'This letter has not been polished. Polish it and click "Use proposal as current draft", or tick "Send without polishing" on the application.';
  return {allowed, applied, pending, overridden, message};
}

export function assertPolished(review) {
  const gate = polishGate(review);
  if (!gate.allowed) throw Object.assign(new Error(gate.message), {statusCode: 409, code: 'LETTER_NOT_POLISHED'});
  return gate;
}
