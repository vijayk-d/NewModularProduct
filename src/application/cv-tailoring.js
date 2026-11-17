// Tailored CV workflow: inspect the base CV, draft from evidence, check owner edits, build a new DOCX version.
// Local only, except the optional Polish step: one paid request after the owner confirms its cost. No Gmail action; the base CV file is never written.
import {createHash} from 'node:crypto';
import {draftTailoredCv, checkTailoredCv} from '../domain/cv/cv-tailoring-policy.js';
import {extractJobKeywords} from '../domain/job-description/extract-job-keywords.js';
import {MATCH_LABELS} from '../domain/cv/word-cv-match.js';
import {DEFAULT_POLISHING_MODEL, normalizePolishingModel, buildPolishingAttempt} from './polishing-model-catalog.js';
import {estimatePolishingApiRequest} from './polishing-cost-estimator.js';

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

export function sectionsMessage(profile, achievements, experience = null) {
  const part = (section, name) => !section ? `No ${name} heading was recognised.`
    : `Found "${section.heading}" but no text directly under it; the text may be in a text box or a separate column.`;
  const bullets = achievements?.supported || experience?.supported ? null
    : experience ? `Found "${experience.heading}" but no bulleted lines under its employers, and no Key achievements section.`
    : part(achievements, 'Key achievements or Experience');
  const problems = [!profile?.supported && part(profile, 'Profile or Summary'), bullets].filter(Boolean);
  return problems.join(' ') + ' Choose the headings your CV uses below, then draft again.';
}

export function createCvTailoringService({reviews, cvLibrary, worker, cvFolder, store, locateWord = null, polisher = null}) {
  if (!reviews || typeof worker !== 'function' || !store) throw new Error('Tailored CV service needs reviews, a document worker and a store.');
  // Without a folder lookup (tests), only the same-name Word file is tried.
  const locate = locateWord || (async libraryPath => {
    const relativePath = wordPathFor(libraryPath), parts = relativePath.split('/');
    return {relativePath, name: parts.at(-1), match: relativePath ? 'same-name' : 'none', candidates: [], folder: parts.slice(0, -1).join('/'), pdfName: String(libraryPath || '').split('/').pop()};
  });
  const preferences = code => (typeof store.preferences === 'function' ? store.preferences(code) : null) || {};

  async function call(payload) {
    if (typeof cvFolder !== 'string' || !cvFolder.trim()) fail('CV_FOLDER is not configured.', 409);
    try { return await worker({root: cvFolder, ...payload}); }
    catch (error) {
      const file = String(payload.relativePath || '').split(/[\\/]/), name = file.pop(), folder = file.join('/') || 'the CV folder';
      if (error.code === 'CV_FILE_NOT_FOUND') fail(`The Word file "${name}" is no longer in "${folder}". Check the CV folder, then draft again.`, 409, error.code);
      fail(MESSAGES[error.code] || (error.code === 'CV_DOCX_REQUIRED' ? 'A Word (.docx) version of this CV is needed.' : `The Word file "${name}" could not be read (${error.code || 'DOCUMENT_UNAVAILABLE'}). If it is open in Word, close it and try again.`), 409, error.code || 'CV_TAILORING_DOCUMENT');
    }
  }

  async function libraryEntries() { return typeof cvLibrary === 'function' ? (await cvLibrary()) || [] : []; }

  async function resolve(reviewId, wordFile = '') {
    const review = reviews.get(reviewId);
    if (!review) fail('Saved application not found.', 404);
    const roleCode = selectedCvCode(review);
    if (!roleCode) fail('Choose and apply a CV for this application first.', 409);
    const entry = (await libraryEntries()).find(e => e?.role_code === roleCode) || (review.prepared?.rankedCvs || []).map(r => r.cv).find(cv => cv?.role_code === roleCode);
    if (!entry?.local_path) fail(`CV ${roleCode} is not in the CV library.`, 409);
    const saved = preferences(roleCode);
    const word = await locate(entry.local_path, String(wordFile || saved.wordFile || ''));
    return {review, roleCode, roleName: entry.role_name || '', word, saved};
  }

  async function inspect(reviewId, options = {}) {
    const target = await resolve(reviewId, options.wordFile);
    const chosen = chosenHeadings({profileHeading: options.profileHeading || target.saved.profileHeading, achievementsHeading: options.achievementsHeading || target.saved.achievementsHeading});
    if (!target.word.relativePath) return {...target, chosen, missingWord: true};
    const result = await call({action: 'sections', relativePath: target.word.relativePath, expectedHash: null, ...chosen});
    return {...target, chosen, relativePath: target.word.relativePath, name: result.name, sha256: result.sha256, sections: result.sections};
  }

  const usable = sections => {
    const {profile, achievements, experience} = sections || {};
    return {profile: profile?.supported ? profile : null, achievements: achievements?.supported ? achievements : null, experience: experience?.supported ? experience : null};
  };
  const wordInfo = word => ({name: word.name, match: word.match, label: MATCH_LABELS[word.match] || word.match, folder: word.folder, pdfName: word.pdfName, candidates: word.candidates});
  const summary = sections => {
    const u = usable(sections), parts = [];
    if (u.profile) parts.push(u.profile.heading);
    if (u.achievements) parts.push(u.achievements.heading);
    if (u.experience) parts.push(`${u.experience.heading} (${u.experience.roles.length} employers)`);
    return parts.join(' + ');
  };

  // Polish (part 2, paid): the request is rebuilt from the current CV and the wording on the page, so the cost proof
  // the owner confirmed matches exactly what is sent. One request per confirmed click; no retries.
  let polishing = false;
  const textList = (value, name) => {
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) fail(`${name} must be a list of lines.`);
    return value.map(v => v.replace(/\s+/g, ' ').trim()).filter(Boolean);
  };
  const POLISH_OFF = 'CV polishing is off. It uses the same setting as letter polishing: ENABLE_COVER_LETTER_REFINEMENT=true and PERPLEXITY_API_KEY in .env, then restart.';
  async function polishTarget(reviewId, body) {
    if (!polisher || typeof polisher.buildRequest !== 'function') fail('CV polishing is unavailable in this server configuration.', 503, 'CV_POLISH_DISABLED');
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('An explicit polishing request is required.');
    const {expectedSha256, expectedRoleCode, profileHeading = '', achievementsHeading = '', wordFile = ''} = body;
    const found = await inspect(reviewId, {profileHeading, achievementsHeading, wordFile});
    if (expectedRoleCode !== found.roleCode) fail('The CV selection changed. Draft again for the current CV.', 409);
    if (found.missingWord) fail('The Word version of this CV is not available. Draft again.', 409);
    if (expectedSha256 !== found.sha256) fail(MESSAGES.CV_VERSION_CHANGED, 409);
    const use = usable(found.sections);
    if (!use.profile || (!use.achievements && !use.experience)) fail(MESSAGES.CV_SECTIONS_NOT_FOUND, 409);
    const roleSources = use.experience ? use.experience.roles : [];
    const profile = textList(body.profile, 'Summary');
    if (!profile.length) fail('Write or keep a summary before polishing.');
    const achievements = use.achievements && body.achievements != null ? textList(body.achievements, 'Key achievements') : null;
    let roles = [];
    if (roleSources.length && body.roles != null) {
      if (!Array.isArray(body.roles) || body.roles.length !== roleSources.length) fail('The employers in your CV changed. Draft again.', 409);
      roles = body.roles.map((r, i) => ({title: roleSources[i].title || `Employer ${i + 1}`, bullets: textList(r, roleSources[i].title || 'Employer bullets'), originalBullets: roleSources[i].bullets}));
    }
    const review = found.review, form = review.formData || {};
    const request = {jobTitle: String(form.jobTitle || ''), organisationName: String(form.organisationName || ''), keywords: jobKeywords(review).slice(0, 30), jobDescriptionText: String(form.jobDescriptionText || ''),
      profile, achievements, roles, originalProfile: use.profile.paragraphs, originalAchievements: use.achievements ? use.achievements.paragraphs : null, selectedEvidence: selectedEvidence(review)};
    if (JSON.stringify(request).length > 60000) fail('The CV wording is too long to polish in one request.');
    const model = normalizePolishingModel(body.model || review.polishingModel || DEFAULT_POLISHING_MODEL);
    const apiBody = polisher.buildRequest(request, model);
    return {found, use, roleSources, request, model, apiBody, costProof: sha(Buffer.from(JSON.stringify(apiBody)))};
  }

  return {
    // Cost estimate only: nothing is sent anywhere.
    async polishEstimate(reviewId, body) {
      const t = await polishTarget(reviewId, body), e = estimatePolishingApiRequest(t.apiBody);
      return {available: Boolean(polisher.available), model: t.model, costProof: t.costProof, estimatedInputTokens: e.estimatedInputTokens, outputTokenBudget: e.outputTokenBudget,
        models: e.models.map(m => ({id: m.id, label: m.label, provider: m.provider, estimatedTokenCostUsd: m.estimatedTokenCostUsd})), assumption: e.assumption, limitation: e.limitation,
        ...(polisher.available ? {} : {message: POLISH_OFF})};
    },

    // Sends one paid request after the owner confirmed this exact estimate. The result only fills the editor.
    async polish(reviewId, body) {
      if (polishing) fail('A polishing request is already running. Wait for it to finish.', 409, 'CV_POLISH_BUSY');
      polishing = true;
      try {
        const t = await polishTarget(reviewId, body);
        if (!polisher.available || typeof polisher.polish !== 'function') fail(POLISH_OFF, 503, 'CV_POLISH_DISABLED');
        if (body.confirmedCostProof !== t.costProof) fail('The wording or model changed since the cost estimate. Estimate again; nothing was sent.', 409, 'CV_POLISH_ESTIMATE_STALE');
        let outcome;
        try { outcome = await polisher.polish(t.request, t.model); }
        catch (error) { fail(`${String(error.code || '').startsWith('CV_POLISH_') ? error.message : 'The polishing service failed.'} Nothing changed and no retry was made.`, 503, error.code || 'CV_POLISH_FAILED'); }
        const r = outcome?.result || {}, problems = [];
        const list = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean) : []);
        const profile = list(r.summary);
        if (!profile.length) fail('The polished wording had no summary, so nothing was changed.', 502, 'CV_POLISH_INVALID_RESPONSE');
        const achievements = t.request.achievements ? list(r.keyAchievements) : null;
        if (achievements && !achievements.length) fail('The polished wording dropped the Key achievements, so nothing was changed.', 502, 'CV_POLISH_INVALID_RESPONSE');
        let roles = null;
        if (t.request.roles.length) {
          const employers = Array.isArray(r.employers) ? r.employers : [];
          if (employers.length !== t.request.roles.length) fail('The polished wording changed the number of employers, so nothing was changed.', 502, 'CV_POLISH_INVALID_RESPONSE');
          roles = employers.map((e, i) => {
            const bullets = list(e?.bullets), given = t.request.roles[i];
            if (!bullets.length) return given.bullets;
            if (bullets.length > given.bullets.length) problems.push(`${given.title}: the polish added bullets; check them carefully.`);
            return bullets;
          });
        }
        const check = checkTailoredCv({profile, achievements, roles: t.roleSources.length ? roles || t.roleSources.map(x => x.bullets) : null, roleSources: t.roleSources,
          sources: [...t.use.profile.paragraphs, ...(t.use.achievements?.paragraphs || []), ...t.roleSources.flatMap(x => x.bullets), ...t.request.selectedEvidence]});
        const notes = typeof r.notes === 'string' ? r.notes.replace(/\s+/g, ' ').trim().slice(0, 600) : '';
        return {proposal: {profile, achievements, roles}, problems: [...problems, ...check.problems], notes,
          attempt: buildPolishingAttempt({requestModel: t.model, response: outcome.response, durationMs: outcome.durationMs, webSearchEnabled: false, outcome: 'passed'})};
      } finally { polishing = false; }
    },

    async draft(reviewId, options = {}) {
      const found = await inspect(reviewId, options);
      const latest = store.latest(reviewId);
      if (found.missingWord) {
        const {word} = found;
        return {reviewId, roleCode: found.roleCode, latest, ready: false, needsWordFile: true, word: wordInfo(word), headings: [],
          message: word.match === 'choose'
            ? `The folder "${word.folder || 'CV folder'}" has several Word files and none has the same name as "${word.pdfName}". Choose the Word version of this CV below.`
            : `No Word (.docx) file was found in "${word.folder || 'CV folder'}" for "${word.pdfName}". Save the Word version of this CV in that folder, then draft again.`};
      }
      const {profile, achievements, experience} = found.sections || {};
      const use = usable(found.sections);
      const base = {reviewId, roleCode: found.roleCode, baseName: found.name, baseSha256: found.sha256, latest, chosen: found.chosen, word: wordInfo(found.word), headings: found.sections?.headings || [],
        sections: {profile: profile ? {heading: profile.heading, lines: profile.paragraphs.length, supported: profile.supported} : null,
          achievements: achievements ? {heading: achievements.heading, lines: achievements.paragraphs.length, bullets: achievements.bullets, supported: achievements.supported} : null,
          experience: experience ? {heading: experience.heading, roles: experience.roles.length, supported: experience.supported} : null}};
      if (!use.profile || (!use.achievements && !use.experience)) return {...base, ready: false, message: sectionsMessage(profile, achievements, experience)};
      // Explicit choices that work are remembered for this CV, for every application and the Export pack.
      if ((options.wordFile || options.profileHeading || options.achievementsHeading) && typeof store.savePreferences === 'function') {
        store.savePreferences(found.roleCode, {wordFile: found.word.match === 'chosen' ? found.word.name : '', ...found.chosen});
      }
      return {...base, ready: true, polishAvailable: Boolean(polisher?.available), roleOrder: use.experience ? use.experience.roles.map(r => r.bullets) : [], ...draftTailoredCv({profile: use.profile.paragraphs, achievements: use.achievements ? use.achievements.paragraphs : null, roles: use.experience ? use.experience.roles : [], selected: selectedEvidence(found.review), keywords: jobKeywords(found.review)})};
    },

    async build(reviewId, request) {
      if (!request || typeof request !== 'object' || Array.isArray(request)) fail('An explicit build request is required.');
      const {profile, achievements = null, roles = null, expectedSha256, expectedRoleCode, profileHeading = '', achievementsHeading = '', wordFile = ''} = request;
      const found = await inspect(reviewId, {profileHeading, achievementsHeading, wordFile});
      if (expectedRoleCode !== found.roleCode) fail('The CV selection changed. Draft again for the current CV.', 409);
      if (found.missingWord) fail('The Word version of this CV is not available. Draft again.', 409);
      if (expectedSha256 !== found.sha256) fail(MESSAGES.CV_VERSION_CHANGED, 409);
      const use = usable(found.sections);
      if (!use.profile || (achievements !== null && !use.achievements) || (roles !== null && !use.experience)) fail(MESSAGES.CV_SECTIONS_NOT_FOUND, 409);
      const roleSources = use.experience ? use.experience.roles : [];
      const check = checkTailoredCv({profile, achievements, roles, roleSources,
        sources: [...use.profile.paragraphs, ...(use.achievements?.paragraphs || []), ...roleSources.flatMap(r => r.bullets), ...selectedEvidence(found.review)]});
      if (!check.ok) fail(check.problems.join(' '), 400, 'CV_TAILORING_CHECK');
      const built = await call({action: 'tailor', relativePath: found.relativePath, expectedHash: found.sha256, profile: check.profile,
        ...(check.achievements ? {achievements: check.achievements} : {}), ...(check.roles ? {roles: check.roles} : {}), ...found.chosen});
      const bytes = Buffer.from(built.data, 'base64');
      return store.save({reviewId, roleCode: found.roleCode, baseName: found.name, baseSha256: found.sha256, profile: check.profile,
        achievements: check.roles ? {achievements: check.achievements, roles: check.roles} : check.achievements, bytes, sha256: sha(bytes)});
    },

    // Read-only check of every CV in the library: Word file found, and sections recognised. No CV is changed.
    async checkLibrary() {
      const rows = [];
      for (const entry of await libraryEntries()) {
        const roleCode = String(entry?.role_code || ''), saved = preferences(roleCode);
        const row = {roleCode, roleName: entry?.role_name || '', pdf: entry?.local_path || '', word: '', match: '', label: '', sections: '', ready: false, problem: ''};
        try {
          const word = await locate(entry.local_path, saved.wordFile || '');
          Object.assign(row, {word: word.name, match: word.match, label: MATCH_LABELS[word.match] || word.match});
          if (!word.relativePath) {
            row.problem = word.match === 'choose' ? `Several Word files in "${word.folder}"; open an application with this CV and choose one.` : `No Word file in "${word.folder}".`;
          } else {
            const result = await call({action: 'sections', relativePath: word.relativePath, expectedHash: null, ...chosenHeadings(saved)});
            const use = usable(result.sections);
            row.sections = summary(result.sections);
            row.ready = Boolean(use.profile && (use.achievements || use.experience));
            if (!row.ready) row.problem = sectionsMessage(result.sections?.profile, result.sections?.achievements, result.sections?.experience).replace(' Choose the headings your CV uses below, then draft again.', ' Open an application with this CV to choose its headings.');
          }
        } catch (error) { row.problem = error.statusCode ? error.message : 'Could not be checked.'; }
        rows.push(row);
      }
      return {checked: rows.length, ready: rows.filter(r => r.ready).length, rows};
    },

    // Word file for the Export pack: the same lookup and saved choice as Tailored CV.
    async wordPathForExport(roleCode, libraryPath) {
      return (await locate(libraryPath, preferences(roleCode).wordFile || '')).relativePath;
    },

    latest: reviewId => store.latest(reviewId),
    file: (reviewId, version) => store.get(reviewId, version)
  };
}
