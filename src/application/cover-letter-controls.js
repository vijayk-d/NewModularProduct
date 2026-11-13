export const LETTER_TONES = Object.freeze([
  {value:'problem-solver',label:'Problem solver',instruction:'Use a practical, analytical, outcome-focused first-person voice. Show a relevant evidenced challenge or opportunity, the candidate\'s diagnosis and judgement, chosen actions and mechanisms, and supported outcomes. Connect tactical execution to documented strategic priorities where supported. Do not invent a problem-action-result chain, causation, metrics, current responsibilities or ownership. Distinguish demonstrated past experience from prospective approaches; keep evidence commentary outside the letter.'},
  { value: 'professional', label: 'Professional and evidence-led', instruction: 'Use clear, professional, evidence-led prose with restrained confidence.' },
  { value: 'confident', label: 'Confident and direct', instruction: 'Use confident, direct prose without exaggeration or unsupported claims.' },
  { value: 'warm', label: 'Warm and conversational', instruction: 'Use approachable, conversational prose while remaining professional and specific.' },
  { value: 'concise', label: 'Concise and understated', instruction: 'Use concise, understated prose, short sentences and minimal rhetorical flourishes.' },
 {value:'executive',label:'Executive and strategic',instruction:'Connect documented leadership and delivery evidence to organisational priorities and business outcomes. Never inflate ownership or invent strategic responsibility.'},
 {value:'consultative',label:'Consultative and problem-solving',instruction:'Explain vacancy challenges and credible evidence-led contributions in thoughtful, practical language. Distinguish past achievements from prospective approaches.'},
 {value:'collaborative',label:'Collaborative leadership',instruction:'Emphasise documented stakeholder alignment, cross-functional collaboration and team enablement while preserving actual ownership and contribution.'},
 {value:'technical',label:'Technical and delivery-focused',instruction:'Use precise technical and delivery language grounded in supplied evidence. Explain execution and outcomes without dense jargon or unsupported expertise.'}
]);
export const EVIDENCE_ROI_POLICY='Tone changes voice only, never letter structure or evidence. Write each evidence item as its own plaintext line starting with the literal \u2022 character and a space, with exactly one organisation per bullet; never present evidence as unbulleted sentences. Make each bullet ROI-led: At ORGANISATION, I RESULT by ACTION. Lead with the measurable result that permitted evidence states for the same organisation and the same piece of work, keeping figure, unit and period exactly as written; if no permitted metric exists, state the concrete business outcome rather than activity alone. Prefer evidence items that carry a sourced result over activity-only items. Never invent, estimate, round, combine or move metrics between organisations, and do not upgrade a supporting role into ownership. When the user has selected scenarios, include every selected scenario: one bullet per organisation, combining scenarios from the same organisation into that bullet, and enrich each with detail the CV or highlights state for the same organisation and work. Without selected scenarios use at most three evidence bullets, one per organisation, chosen for relevance to the job description. Present bullets in reverse-chronological employment order (most recent first, using supplied periods or CV dates); omit AI examples unless the job asks for AI. Prefer owned verbs (led, delivered, introduced, reduced) where the source supports ownership; avoid supported, helped, contributed to and focused on. In the employer-alignment paragraph, name one or two priorities taken from the job description wording and say how my approach would serve them; never restate the evidence bullets or use employer slogans the supplied text does not state. Vary the opening sentence; do not use the phrase interests me because and do not repeat the word opportunity.';
export function letterToneInstruction(value='professional'){const tone=normalizeLetterTone(value);return LETTER_TONES.find(item=>item.value===tone).instruction+' '+EVIDENCE_ROI_POLICY;}
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
export function assertNoSourceCommentary(body){
 const text=String(body||'').replace(/\s+/g,' ');
 const pattern=/\b(?:(?:the|my|your|the supplied|the provided|the candidate['’]s)\s+(?:cv|curriculum vitae|r[eé]sum[eé]|profile)\s+(?:records?|states?|shows?|indicates?|mentions?|reports?|documents?|confirms?|demonstrates?|highlights?|lists?|notes?|describes?|suggests?)|(?:the supplied|the provided|the available)\s+evidence\s+(?:shows?|indicates?|records?|confirms?|suggests?)|according to\s+(?:(?:the|my|your|the supplied|the provided)\s+)?(?:cv|curriculum vitae|r[eé]sum[eé]|profile))\b/iu;
 if(pattern.test(text))throw Object.assign(new Error('Source commentary appeared in the proposed letter. Write supported experience directly in the candidate\'s voice; put evidence limitations in separate warnings. Current letter unchanged. No automatic paid retry.'),{code:'REFINEMENT_SOURCE_COMMENTARY_REJECTED',statusCode:400});
}
export function assertLetterBodySafe(body, excludedEmployers = ['micro1']) {
  const text = String(body || '');
  assertNoSourceCommentary(text);
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

export function highlightPhrasePatternSource(phrase){return String(phrase).normalize('NFKC').trim().split(/[\s\u2010-\u2015-]+/u).filter(Boolean).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[ \\t\\u00a0\\u2010-\\u2015-]+');}
export function selectAlignedHighlights(phrases,body,request={}){
 const jd=String(request.jobDescriptionText||'');if(!jd.trim())return [];
 const evidence=new Set(words([request.selectedCvText,request.candidateLinkedInText,...(request.selectedCvHighlights||[])].filter(Boolean).join(' ')));
 const valid=p=>{if(p.length>120||/[<>\r\n{}]/.test(p))return false;const tokens=words(p).filter(w=>!filler.has(w)),pattern=highlightPhrasePatternSource(p);if(!tokens.length||!pattern)return false;const regex=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+pattern+')(?![\\p{L}\\p{N}_])','iu');return regex.test(String(body))&&regex.test(jd)&&(!evidence.size||tokens.every(w=>evidence.has(w)));};
 let result=[...new Set((Array.isArray(phrases)?phrases:[]).map(v=>String(v||'').trim()).filter(Boolean))].filter(valid);
 return result.slice(0,16);
}
