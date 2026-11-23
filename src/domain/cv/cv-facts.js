// Facts read from a CV's own text, so letters and answers can name them without inventing anything:
// certifications that appear in the CV, and a stated length of experience ("15+ years"). Pure.

// Recognised certifications, with the wording to show. Only those written in the CV are returned.
const CERTIFICATIONS = [
  [/\bPMP\b/, 'PMP'], [/\bPMI[- ]ACP\b/, 'PMI-ACP'], [/\bCAPM\b/, 'CAPM'], [/\bCPMAI\b/, 'CPMAI'],
  [/\bPRINCE\s?2\s+(?:Agile\s+)?Practitioner\b/i, m => m[0].replace(/\s+/g, ' ').replace(/prince\s?2/i, 'PRINCE2')],
  [/\bPRINCE\s?2\s+(?:Agile\s+)?Foundation\b/i, m => m[0].replace(/\s+/g, ' ').replace(/prince\s?2/i, 'PRINCE2')],
  [/\bPRINCE\s?2\b/i, 'PRINCE2'],
  [/\bManaging Successful Programmes\b|\bMSP\s+(?:Practitioner|Foundation)\b/i, m => /practitioner|foundation/i.test(m[0]) ? m[0].replace(/\s+/g, ' ').replace(/^msp/i, 'MSP') : 'MSP (Managing Successful Programmes)'],[/\bAgilePM\b/i, 'AgilePM'], [/\bAPM\s+(?:PMQ|PFQ|PQ|ChPP)\b/i, m => m[0].toUpperCase().replace('CHPP', 'ChPP')],
  [/\bProfessional Scrum Master\b(?:\s*(?:I{1,3}|\(PSM\s*I{1,3}\)))?/i, m => m[0].replace(/\s+/g, ' ')], [/\bPSM\s?I{1,3}\b/, m => m[0].replace(/\s+/g, ' ')],
  [/\bProfessional Scrum Product Owner\b/i, 'Professional Scrum Product Owner'], [/\bPSPO\s?I{0,3}\b/, m => m[0].trim()],
  [/\bCertified Scrum ?Master\b/i, 'Certified ScrumMaster (CSM)'], [/\bCSPO\b/, 'CSPO'],
  [/\bSAFe\s*(?:\d(?:\.\d)?\s*)?(?:Agilist|SPC|RTE|Release Train Engineer|Program Consultant|Practice Consultant|Scrum Master|Product Owner\/Product Manager|POPM|Lean Portfolio Manager|LPM)\b/i, m => m[0].replace(/\s+/g, ' ').replace(/^safe/i, 'SAFe')],
  [/\bICAgile\b(?:\s+Certified\s+[A-Z][\w ]{2,40})?/, m => m[0].replace(/\s+/g, ' ').trim()],
  [/\bKanban (?:Management Professional|System Design)\b/i, m => m[0]], [/\bITIL\s?(?:v?\d)?\s*(?:Foundation)?\b/i, m => m[0].replace(/\s+/g, ' ').trim().replace(/^itil/i, 'ITIL')],
  [/\bLean Six Sigma (?:Green|Black|Yellow) Belt\b/i, m => m[0]], [/\bTOGAF\b/, 'TOGAF'], [/\bCBAP\b/, 'CBAP'], [/\bCISSP\b/, 'CISSP'],
  [/\bAWS Certified [A-Z][\w -]{3,50}\b/, m => m[0].trim()], [/\bMicrosoft Certified:? [A-Z][\w -]{3,50}\b/, m => m[0].trim()]
];

export function certificationsIn(text = '') {
  const value = String(text || ''), out = [];
  for (const [pattern, show] of CERTIFICATIONS) {
    const m = pattern.exec(value);
    if (!m) continue;
    const name = typeof show === 'function' ? show(m) : show;
    // A more specific match ("PRINCE2 Practitioner") already covers the general one ("PRINCE2").
    if (out.some(o => o.toLowerCase().startsWith(name.toLowerCase()) || name.toLowerCase().startsWith(o.toLowerCase()))) continue;
    out.push(name);
  }
  return out.slice(0, 6);
}

// "15+ years", "over 12 years", "12 years' experience": the largest stated figure between 2 and 45 years.
export function yearsOfExperienceIn(text = '') {
  let best = 0, label = '';
  for (const m of String(text || '').matchAll(/\b(over|more than)?\s*(\d{1,2})\s*(\+)?\s*years?['’]?\s+(?:of\s+)?(?:experience|expertise|track record|in\b)/gi)) {
    const n = Number(m[2]);
    if (n >= 2 && n <= 45 && n > best) { best = n; label = m[3] || m[1] ? `more than ${n} years` : `${n} years`; }
  }
  return label;
}

// CV facts as evidence lines (source "Selected CV"), for answers and the fit paragraph.
export function cvFactLines(text = '') {
  const lines = [], certs = certificationsIn(text), years = yearsOfExperienceIn(text);
  if (certs.length) lines.push({text: 'Certifications: ' + certs.join(', ') + '.', source: 'Selected CV', kind: 'certifications', items: certs});
  if (years) lines.push({text: 'Experience: ' + years + '.', source: 'Selected CV', kind: 'years', value: years});
  return lines;
}
