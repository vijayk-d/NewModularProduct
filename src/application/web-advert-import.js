// "Paste any advert": an advert from any job site (not LinkedIn) becomes a stored job import.
// Its ID is a hash of the normalised advert URL, so advert status works the same way as for LinkedIn adverts.
// Pure apart from hashing. No network calls: the owner pastes the advert text.
import {createHash, randomUUID} from 'node:crypto';
import {vacancyIdentity} from './vacancy-identity.js';

export const WEB_ADVERT_PREFIX = 'web-';
const WEB_ID = /^web-[a-f0-9]{16}$/;
const LINKEDIN_ID = /^\d{1,20}$/;
const reject = message => { throw Object.assign(new Error(message), {code: 'JOB_IMPORT_REJECTED', statusCode: 400}); };

export const isWebAdvertId = id => typeof id === 'string' && WEB_ID.test(id);
export const isAdvertId = id => typeof id === 'string' && (LINKEDIN_ID.test(id) || WEB_ID.test(id));
const isLinkedInHost = host => host === 'linkedin.com' || host.endsWith('.linkedin.com');

// Same normalisation as vacancy matching: lower-case host, no #fragment, no utm_/click IDs, sorted query.
export function canonicalAdvertUrl(value) {
  const url = vacancyIdentity({jobAdvertLink: String(value || '').trim()}).advertUrl;
  return url || '';
}

// Hash ID for a non-LinkedIn advert URL; '' for LinkedIn or an unusable URL.
export function webAdvertId(value) {
  const url = canonicalAdvertUrl(value);
  if (!url) return '';
  try { if (isLinkedInHost(new URL(url).hostname.replace(/^www\./, ''))) return ''; } catch { return ''; }
  return WEB_ADVERT_PREFIX + createHash('sha256').update(url).digest('hex').slice(0, 16);
}

function text(value, max, label, required = false) {
  if (value !== undefined && value !== null && typeof value !== 'string') reject(label + ' must be text.');
  const v = String(value ?? '').trim();
  if (/\0/.test(v) || v.length > max) reject(label + ' is too long.');
  if (required && !v) reject(label + ' is required.');
  return v;
}

export function normalizeWebImport(input, {now = () => new Date(), id = randomUUID} = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject('Advert details required.');
  const allowed = ['jobAdvertLink', 'jobTitle', 'jobDescriptionText', 'advertiserName', 'location'];
  if (Object.keys(input).some(k => !allowed.includes(k))) reject('Unsupported advert fields.');
  const raw = text(input.jobAdvertLink, 2048, 'Advert link', true);
  let parsed;
  try { parsed = new URL(raw); } catch { reject('Enter the full advert link, starting https://'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) reject('Use an https advert link without a user name, password or port.');
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (isLinkedInHost(host)) reject('This is a LinkedIn advert: send it with the LinkedIn reader instead.');
  const jobAdvertLink = canonicalAdvertUrl(raw), jobId = webAdvertId(raw);
  if (!jobAdvertLink || !jobId) reject('Enter the full advert link, starting https://');
  const jobTitle = text(input.jobTitle, 300, 'Job title', true);
  const jobDescriptionText = text(input.jobDescriptionText, 48000, 'Job description', true);
  if (Buffer.byteLength(jobDescriptionText) > 48000) reject('Job description exceeds 48 KiB; it will not be truncated.');
  if (jobDescriptionText.length < 80) reject('Paste the whole job description (at least 80 characters).');
  return {
    schemaVersion: 1, source: 'web', requestId: id(), jobId, jobAdvertLink, sourceSite: host,
    jobTitle, jobDescriptionText,
    advertiser: {name: text(input.advertiserName, 300, 'Advertiser'), linkedinUrl: '', companyLinkedinUrl: ''},
    stakeholderPageUrl: '',
    location: {text: text(input.location, 300, 'Location'), workplaceType: 'unknown', workingPatternText: ''},
    jobPosters: [],
    extraction: {readerVersion: 'paste-v1', extractedAt: now().toISOString(), descriptionStatus: 'unknown'}
  };
}

// Content hash: the facts only, so pasting the same advert again keeps the same revision.
export function webImportHash(p) {
  const {requestId, extraction, ...facts} = p;
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex');
}

export function createMemoryWebAdvertRepository() {
  let next = 0;
  const current = new Map(), versions = new Map();
  return {
    all: () => structuredClone([...current.values()]),
    lookup: id => structuredClone(current.get(id)),
    get: (importId, revision) => structuredClone(versions.get(importId + ':' + revision)),
    save(p, hash) {
      const old = current.get(p.jobId);
      if (old?.contentHash === hash) return structuredClone({...old, duplicate: true});
      const value = {...p, importId: old?.importId || 'web-import-' + (++next), revision: (old?.revision || 0) + 1, contentHash: hash, receivedAt: new Date().toISOString()};
      current.set(p.jobId, value); versions.set(value.importId + ':' + value.revision, value);
      return structuredClone({...value, duplicate: false});
    }
  };
}
