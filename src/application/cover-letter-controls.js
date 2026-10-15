export const LETTER_TONES = Object.freeze([
  { value: 'professional', label: 'Professional and evidence-led', instruction: 'Use clear, professional, evidence-led prose with restrained confidence.' },
  { value: 'confident', label: 'Confident and direct', instruction: 'Use confident, direct prose without exaggeration or unsupported claims.' },
  { value: 'warm', label: 'Warm and conversational', instruction: 'Use approachable, conversational prose while remaining professional and specific.' },
  { value: 'concise', label: 'Concise and understated', instruction: 'Use concise, understated prose, short sentences and minimal rhetorical flourishes.' }
]);
export function normalizeLetterTone(value = 'professional') {
  const tone = String(value || 'professional').trim();
  if (!LETTER_TONES.some(item => item.value === tone)) {
    const error = new Error('Choose a supported cover-letter tone.'); error.code = 'REFINEMENT_TONE_INVALID'; throw error;
  }
  return tone;
}
export function normalizeExcludedEmployers(value) {
  return [...new Set(['micro1', ...(Array.isArray(value) ? value : [])]
    .map(item => String(item || '').trim().toLowerCase()).filter(Boolean))];
}
export function assertLetterBodySafe(body, excludedEmployers = ['micro1']) {
  const text = String(body || '');
  const fail = (message, code, diagnostics) => { const error = new Error(message); error.code = code; error.statusCode = 400; if(diagnostics)error.safeDiagnostics=diagnostics; throw error; }; // outreach-content-diagnostics-v1
  if (/<\/?[a-z][^>]*>/i.test(text)) {
    const known=new Set(['a','p','br','div','span','strong','b','em','i','u','mark','ul','ol','li','table','tr','td','th','html','body','font','h1','h2','h3','http','https']);
    const matches=[...text.matchAll(/<\/?([a-z][a-z0-9-]*)[^>]*>/gi)];
    const tagCategories=[...new Set(matches.map(m=>known.has(m[1].toLowerCase())?m[1].toLowerCase():'other'))].slice(0,10);
    fail('The proposal contains unresolved placeholders or raw HTML. The plain-text experience contains literal HTML-like markup; use rendered text, not pasted HTML source.', 'REFINEMENT_BODY_REJECTED', {htmlLikeCount:matches.length,tagCategories});
  }
  if (/https?:\/\/|www\.|\[[^\]\n]+\]\([^\n)]*\)|\[(?:(?:cite|web|file):)?\d+(?:[ ,\u2013-]+\d+)*\]|\[\^[^\]]+\]|【[^】]*(?:\d|cite|source)[^】]*】|\b[\w.-]+\.(?:co\.uk|org\.uk|com|org|net)(?:[\/\s]|$)/i.test(text)) {
    fail('Research links, citations or Markdown links appeared in the experience body. The proposal was not accepted.', 'REFINEMENT_BODY_LINK_REJECTED');
  }
  if (/\b(?:once CTAs are agreed|I (?:will|can) make edits|I (?:have not|haven't) claimed|reasonable reading of the evidence)\b/i.test(text)) {
    fail('Editorial commentary appeared in the experience body. The proposal was not accepted.', 'REFINEMENT_COMMENTARY_REJECTED');
  }
  for (const employer of normalizeExcludedEmployers(excludedEmployers)) {
    const escaped = employer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = employer === 'micro1' ? /\bmicro\s*1\b/i : new RegExp(`\\b${escaped}\\b`, 'i');
    if (pattern.test(text)) fail('An excluded employer appeared in the experience body. The proposal was not accepted.', 'REFINEMENT_EXCLUDED_EMPLOYER');
  }
}
const words = text => String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const filler = new Set('a an the and or of to in at for with on by from across my i we our their your led lead leading delivered delivering managed managing improved achieved supported experience working work'.split(' '));
export function selectAlignedHighlights(phrases, body, request = {}) {
  const jd = new Set(words(request.jobDescriptionText));
  const evidenceText = [request.selectedCvText, request.candidateLinkedInText, ...(request.selectedCvHighlights || [])].filter(Boolean).join(' ');
  const evidence = new Set(words(evidenceText));
  const candidates = [...new Set((Array.isArray(phrases) ? phrases : []).map(item => String(item || '').trim()).filter(Boolean))];
  return candidates.filter(phrase => {
    if (phrase.length > 120 || /[<>\r\n{}]/.test(phrase) || !String(body).toLowerCase().includes(phrase.toLowerCase())) return false;
    const significant = words(phrase).filter(word => !filler.has(word));
    if (!significant.length) return false;
    return (!jd.size || significant.every(word => jd.has(word))) &&
      (!evidence.size || significant.every(word => evidence.has(word)));
  }).slice(0, 8);
}
