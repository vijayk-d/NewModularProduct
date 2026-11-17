// Tailored CV workflow: inspect the base CV, draft from evidence, check owner edits, build a new DOCX version.
// Local only: no paid call, no Gmail action, and the base CV file is never written.
import {createHash} from 'node:crypto';
import {draftTailoredCv, checkTailoredCv} from '../domain/cv/cv-tailoring-policy.js';
import {extractJobKeywords} from '../domain/job-description/extract-job-keywords.js';

const fail = (message, statusCode = 400, code = 'CV_TAILORING_BLOCKED') => { throw Object.assign(new Error(message), {statusCode, code}); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const MESSAGES = {
  CV_SECTIONS_NOT_FOUND: 'Could not find both a Profile and a Key achievements section in the Word CV.',
  CV_SECTION_LAYOUT_UNSUPPORTED: 'The Profile or Key achievements section layout is not supported for automatic replacement.',
  CV_SECTION_BREAK_INSIDE: 'A page or section break sits inside the Profile or Key achievements section; edit the Word CV and try again.',
  CV_VERSION_CHANGED: 'The Word CV changed since it was checked. Draft again.',
  CV_TAILOR_VERIFY_FAILED: 'The rebuilt CV did not match the approved wording, so nothing was saved.'
};

export function selectedCvCode(review) {
  return String(review?.selectedCvRoleCode || review?.prepared?.recommendation?.bestCv?.role_code || '');
}

export function wordPathFor(localPath) {
  const value = String(localPath || '');
  if (/\.docx$/i.test(value)) return value;
  if (/\.pdf$/i.test(value)) return value.replace(/\.pdf$/i, '.docx');
  return '';
}

function selectedEvidence(review) {
  const list = Array.isArray(review?.formData?.cvHighlights) ? review.formData.cvHighlights : [];
  return list.map(v => String(v || '').trim()).filter(v => v && v.toLowerCase() !== 'null');
}

function jobKeywords(review) {
  const parsed = review?.prepared?.jobDescription?.keywords;
  if (Array.isArray(parsed) && parsed.length) return parsed;
  return extractJobKeywords(String(review?.formData?.jobDescriptionText || ''));
}

// Headings the owner picked for a CV whose section names are not recognised automatically.
export function chosenHeadings({profileHeading = '', achievementsHeading = ''} = {}) {
  const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const out = {profileHeading: clean(profileHeading), achievementsHeading: clean(achievementsHeading)};
  if (out.profileHeading.length > 80 || out.achievementsHeading.length > 80) fail('Chosen headings must be 80 characters or fewer.');
  if (out.profileHeading && out.profileHeading.toLowerCase() === out.achievementsHeading.toLowerCase()) fail('Choose two different headings for Profile and Key achievements.');
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

export function sectionsMessage(profile, achievements) {
  const part = (section, name) => !section ? `No ${name} heading was recognised.`
    : `Found "${section.heading}" but no text directly under it; the text may be in a text box or a separate column.`;
  const problems = [!profile?.supported && part(profile, 'Profile'), !achievements?.supported && part(achievements, 'Key achievements')].filter(Boolean);
  return problems.join(' ') + ' Choose the headings your CV uses below, then draft again.';
}

export function createCvTailoringService({reviews, cvLibrary, worker, cvFolder, store}) {
  if (!reviews || typeof worker !== 'function' || !store) throw new Error('Tailored CV service needs reviews, a document worker and a store.');

  async function call(payload) {
    if (typeof cvFolder !== 'string' || !cvFolder.trim()) fail('CV_FOLDER is not configured.', 409);
    try { return await worker({root: cvFolder, ...payload}); }
    catch (error) { fail(MESSAGES[error.code] || (error.code === 'CV_DOCX_REQUIRED' ? 'A Word (.docx) version of this CV is needed.' : `The Word version of this CV could not be read (${error.code || 'DOCUMENT_UNAVAILABLE'}). Save it as a .docx next to the PDF with the same name.`), 409, error.code || 'CV_TAILORING_DOCUMENT'); }
  }

  async function resolve(reviewId) {
    const review = reviews.get(reviewId);
    if (!review) fail('Saved application not found.', 404);
    const roleCode = selectedCvCode(review);
    if (!roleCode) fail('Choose and apply a CV for this application first.', 409);
    const entries = typeof cvLibrary === 'function' ? await cvLibrary() : [];
    const entry = entries.find(e => e?.role_code === roleCode) || (review.prepared?.rankedCvs || []).map(r => r.cv).find(cv => cv?.role_code === roleCode);
    const relativePath = wordPathFor(entry?.local_path);
    if (!relativePath) fail(`CV ${roleCode} is not in the CV library.`, 409);
    return {review, roleCode, relativePath, roleName: entry?.role_name || ''};
  }

  async function inspect(reviewId, headings = {}) {
    const target = await resolve(reviewId);
    const chosen = chosenHeadings(headings);
    const result = await call({action: 'sections', relativePath: target.relativePath, expectedHash: null, ...chosen});
    return {...target, chosen, name: result.name, sha256: result.sha256, sections: result.sections};
  }

  return {
    async draft(reviewId, headings = {}) {
      const found = await inspect(reviewId, headings);
      const {profile, achievements} = found.sections || {};
      const latest = store.latest(reviewId);
      const base = {reviewId, roleCode: found.roleCode, baseName: found.name, baseSha256: found.sha256, latest, chosen: found.chosen, headings: found.sections?.headings || [],
        sections: {profile: profile ? {heading: profile.heading, lines: profile.paragraphs.length, supported: profile.supported} : null,
          achievements: achievements ? {heading: achievements.heading, lines: achievements.paragraphs.length, bullets: achievements.bullets, supported: achievements.supported} : null}};
      if (!profile?.supported || !achievements?.supported) return {...base, ready: false, message: sectionsMessage(profile, achievements)};
      return {...base, ready: true, ...draftTailoredCv({profile: profile.paragraphs, achievements: achievements.paragraphs, selected: selectedEvidence(found.review), keywords: jobKeywords(found.review)})};
    },

    async build(reviewId, request) {
      if (!request || typeof request !== 'object' || Array.isArray(request)) fail('An explicit build request is required.');
      const {profile, achievements, expectedSha256, expectedRoleCode, profileHeading = '', achievementsHeading = ''} = request;
      const found = await inspect(reviewId, {profileHeading, achievementsHeading});
      if (expectedRoleCode !== found.roleCode) fail('The CV selection changed. Draft again for the current CV.', 409);
      if (expectedSha256 !== found.sha256) fail(MESSAGES.CV_VERSION_CHANGED, 409);
      const s = found.sections || {};
      if (!s.profile?.supported || !s.achievements?.supported) fail(MESSAGES.CV_SECTIONS_NOT_FOUND, 409);
      const check = checkTailoredCv({profile, achievements, sources: [...s.profile.paragraphs, ...s.achievements.paragraphs, ...selectedEvidence(found.review)]});
      if (!check.ok) fail(check.problems.join(' '), 400, 'CV_TAILORING_CHECK');
      const built = await call({action: 'tailor', relativePath: found.relativePath, expectedHash: found.sha256, profile: check.profile, achievements: check.achievements, ...found.chosen});
      const bytes = Buffer.from(built.data, 'base64');
      return store.save({reviewId, roleCode: found.roleCode, baseName: found.name, baseSha256: found.sha256, profile: check.profile, achievements: check.achievements, bytes, sha256: sha(bytes)});
    },

    latest: reviewId => store.latest(reviewId),
    file: (reviewId, version) => store.get(reviewId, version)
  };
}
