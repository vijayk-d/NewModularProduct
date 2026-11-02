export function acceptRefinedCoverLetter({
  originalDraftPlainText,
  proposedDraftPlainText,
  accepted = false
} = {}) {
  const original = String(originalDraftPlainText ?? '').trim();
  const proposed = String(proposedDraftPlainText ?? '').trim();

  if (!original) {
    throw new Error('An original cover-letter draft is required.');
  }

  if (!proposed) {
    throw new Error('A proposed cover-letter draft is required.');
  }

  if (accepted !== true) {
    return {
      accepted: false,
      finalDraftPlainText: original,
      reason: 'The proposed draft was not accepted.'
    };
  }

  return {
    accepted: true,
    finalDraftPlainText: proposed,
    reason: 'The proposed draft was accepted.'
  };
}