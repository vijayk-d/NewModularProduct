// Suggests whether the advertiser is the employer or a recruitment intermediary, from evidence the app already holds.
// Pure: the caller supplies the evidence. It only suggests; the owner's explicit choice always wins.
import {contextMode} from './advertiser-context.js';

const norm = v => String(v || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const SUFFIX = /\b(ltd|limited|plc|llp|llc|inc|group|holdings|uk|gb|international|global|the)\b/g;
export const advertiserKey = v => norm(v).replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();

// Well-known UK and international recruitment agencies (public names), plus words agencies use in their names.
const KNOWN_AGENCIES = ['hays', 'reed', 'michael page', 'page personnel', 'page executive', 'robert half', 'robert walters', 'harvey nash', 'randstad', 'adecco',
  'manpower', 'manpowergroup', 'experis', 'hudson', 'la fosse', 'tiro partners', 'spectrum it', 'hamilton barnes', 'lorien', 'huxley', 'nigel frank', 'jefferson frank',
  'computer futures', 'searchability', 'opus recruitment solutions', 'gravitas', 'cathcart', 'morson', 'sanderson', 'nicholson glover', 'oliver bernard', 'square one resources',
  'trust in soda', 'eden scott', 'franklin fitch', 'salt', 'understanding recruitment', 'investigo', 'venquis', 'harnham', 'nicoll curtin', 'akkodis',
  'modis', 'progressive', 'crimson', 'hydrogen', 'parallel consulting', 'pertemps', 'kelly services', 'hays technology', 'stott and may', 'fynity', 'mploy'];
const AGENCY_WORDS = /\b(recruit(?:ment|ing|ers?)?|resourcing|staffing|talent (?:solutions|partners|search|acquisition partners)|executive search|search and selection|headhunt\w*|personnel|employment agency|consultancy recruitment)\b/;
const INTERMEDIARY_PHRASES = [
  [/\b(?:our|my|a) client\b/i, 'The advert speaks about "our client" or "my client".'],
  [/\bon behalf of\b/i, 'The advert says it is recruiting "on behalf of" someone.'],
  [/\bacting as an? (?:employment agency|employment business|recruitment agency)\b/i, 'The advert says the poster is acting as an employment agency or business.'],
  [/\b(?:exclusively )?partner(?:ed|ing) with (?:a|an|our|the)\b/i, 'The advert says the poster has partnered with an organisation to fill the role.'],
  [/\b(?:we are|we're) (?:currently )?(?:recruiting|hiring|looking) for (?:a|an) (?:leading|well[- ]known|global|growing|large|major|fast[- ]growing)\b/i, 'The advert describes an unnamed "leading" or "global" organisation.']
];
const DIRECT_PHRASES = [
  [/\bjoin (?:our|the) (?:team|organisation|organization|company)\b/i, 'The advert invites you to "join our team".'],
  [/\b(?:our|we) (?:mission|values|people|customers|colleagues)\b/i, 'The advert speaks about "our mission", "our values" or "our people".'],
  [/\bas an equal opportunit(?:y|ies) employer\b/i, 'The advert says the poster is an equal opportunities employer.']
];
const LABELS = {'direct-employer': 'Direct employer', 'recruitment-intermediary': 'Recruitment agency / intermediary', unknown: 'Unknown / unclear'};
export const relationshipLabel = id => LABELS[id] || LABELS.unknown;

const isAgencyName = name => { const k = advertiserKey(name); return Boolean(k) && (KNOWN_AGENCIES.some(a => k === a || k.startsWith(a + ' ')) || AGENCY_WORDS.test(norm(name))); };
const sameOrganisation = (a, b) => { const x = advertiserKey(a), y = advertiserKey(b); return Boolean(x && y) && (x === y || x.startsWith(y + ' ') || y.startsWith(x + ' ')); };

export function suggestAdvertiserRelationship({organisationName = '', advertiserName = '', jobDescriptionText = '', posters = [], researchSummary = '', pastChoice = null} = {}) {
  const reasons = [];
  let agency = 0, direct = 0;
  const add = (side, points, text) => { if (side === 'agency') agency += points; else direct += points; reasons.push({side, points, text}); };
  const jd = String(jobDescriptionText || '').slice(0, 20000);
  for (const [re, text] of INTERMEDIARY_PHRASES) if (re.test(jd)) add('agency', 3, text);
  let directPhrases = 0;
  for (const [re, text] of DIRECT_PHRASES) if (re.test(jd) && directPhrases < 2) { directPhrases++; add('direct', 1, text); }
  const advertiser = String(advertiserName || '').trim(), organisation = String(organisationName || '').trim();
  if (advertiser) {
    if (isAgencyName(advertiser)) add('agency', 3, `The advert was posted by "${advertiser}", which looks like a recruitment agency.`);
    else if (organisation && sameOrganisation(advertiser, organisation)) add('direct', 2, `The advert was posted by "${advertiser}", the same organisation you are applying to.`);
    else if (organisation) add('agency', 1, `The advert was posted by "${advertiser}", not by "${organisation}".`);
  }
  if (organisation && isAgencyName(organisation) && !advertiser) add('agency', 2, `"${organisation}" looks like a recruitment agency name.`);
  for (const poster of posters.slice(0, 5)) {
    const headline = String(poster?.headline || '');
    const m = /\b(recruit\w*|talent acquisition|talent partner|resourc\w*|headhunt\w*)\b.*?\b(?:at|@|for)\s+(.+)$/i.exec(headline);
    if (!m) continue;
    const employer = m[2].replace(/[|·•].*$/, '').trim();
    if (organisation && sameOrganisation(employer, organisation)) { add('direct', 2, `A poster works in-house: "${headline.slice(0, 90)}".`); break; }
    if (isAgencyName(employer) || (organisation && !sameOrganisation(employer, organisation))) { add('agency', 2, `A poster is a recruiter elsewhere: "${headline.slice(0, 90)}".`); break; }
  }
  if (/\b(recruitment (?:agency|consultancy|firm|business|company)|staffing (?:agency|firm|company)|talent solutions provider|executive search firm)\b/i.test(String(researchSummary || '')))
    add('agency', 2, 'Organisation research describes it as a recruitment or staffing firm.');
  if (pastChoice && LABELS[pastChoice.relationship] && pastChoice.relationship !== 'unknown')
    add(pastChoice.relationship === 'direct-employer' ? 'direct' : 'agency', 4, `You chose "${relationshipLabel(pastChoice.relationship)}" for ${pastChoice.name ? '"' + pastChoice.name + '"' : 'this advertiser'} before.`);
  let relationship = 'unknown';
  if (agency >= 3 && agency > direct) relationship = 'recruitment-intermediary';
  else if (direct >= 2 && direct > agency) relationship = 'direct-employer';
  const margin = Math.abs(agency - direct);
  const confidence = relationship === 'unknown' ? 'low' : margin >= 4 ? 'high' : margin >= 2 ? 'medium' : 'low';
  return {relationship, confidence, label: relationshipLabel(relationship), reasons, scores: {agency, direct}};
}

// Which relationship the next polish should use: the owner's explicit choice, else a confident suggestion, else Unknown.
export function effectiveRelationship(formData = {}, suggestion = null) {
  const stored = formData.advertiserRelationship;
  if (formData.advertiserRelationshipChosen === true && LABELS[stored]) return {relationship: stored, source: 'chosen'};
  if (stored === 'direct-employer' || stored === 'recruitment-intermediary') return {relationship: stored, source: 'saved'};
  if (suggestion && suggestion.relationship !== 'unknown' && suggestion.confidence !== 'low') return {relationship: suggestion.relationship, source: 'suggested'};
  return {relationship: contextMode(formData), source: 'default'};
}
