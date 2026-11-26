// Link-click tracking, Stage 2: when an email is prepared for Gmail (send or draft), the LinkedIn advert link in the
// letter and the LinkedIn profile link in the signature become signed tracker links, and the disclosure footnote is
// added under the signature. Off unless ENABLE_LINK_TRACKING=true. Nothing is sent or retried here.
//
// Each queue item keeps the same random id per link, so preparing the same email again gives the same message.
// Which id belongs to which application and recipient stays in the local store, never at the tracker.
import {newLinkId, signLinkToken, advertLinkKey, targetFor} from '../domain/outreach/link-tokens.js';
import {findTrackedLinks, rewriteTrackedLinks, splitMessage, LINK_TRACKING_FOOTNOTE} from '../domain/outreach/tracked-links.js';

const MAX_LINKS = 20000;
export const LINK_RETENTION_DAYS = 180;
const fail = message => { throw Object.assign(new Error(message), {code: 'LINK_TRACKING_SETUP', statusCode: 409}); };
const on = env => String(env.ENABLE_LINK_TRACKING || '').trim().toLowerCase() === 'true';

// Settings check, with every problem named. Never reports key values.
export function linkTrackingSettings(env = process.env) {
  const enabled = on(env), problems = [];
  let baseUrl = String(env.LINK_TRACKING_BASE_URL || '').trim().replace(/\/+$/, '');
  try { const u = new URL(baseUrl); if (u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash || u.username) problems.push('LINK_TRACKING_BASE_URL must be the tracker address only, starting https://'); baseUrl = u.origin; }
  catch { problems.push('LINK_TRACKING_BASE_URL is missing or not a web address'); baseUrl = ''; }
  const signingKey = String(env.LINK_TRACKING_SIGNING_KEY || '').trim();
  if (signingKey.length < 32) problems.push('LINK_TRACKING_SIGNING_KEY is missing or shorter than 32 characters');
  const profileTarget = targetFor('p', {profileUrl: String(env.LINK_TRACKING_PROFILE_URL || '').trim()});
  if (!profileTarget) problems.push('LINK_TRACKING_PROFILE_URL must be your LinkedIn profile address (linkedin.com/in/...)');
  // Your own wording for the disclosure line. It can be reworded but not removed: blank means the default.
  const footnote = String(env.LINK_TRACKING_FOOTNOTE || '').trim() || LINK_TRACKING_FOOTNOTE;
  if (footnote.length < 20 || footnote.length > 240 || /[\r\n<>{}]|https?:|www\./i.test(footnote)) problems.push('LINK_TRACKING_FOOTNOTE must be one plain line of 20 to 240 characters, with no links or < > { }');
  return {enabled, ready: enabled && !problems.length, configured: !problems.length, problems: enabled ? problems : [], baseUrl, signingKey, profileTarget, footnote};
}

// Stage 4: people (or whole organisations, as @domain) who asked not to have their clicks counted. Their emails get
// no tracked links and no footnote, and clicks on links already sent to them are no longer counted.
export function normaliseOptOut(value) {
  const v = String(value || '').trim().toLowerCase();
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v) || /^@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(v)) return v.length <= 254 ? v : '';
  return '';
}
export const optedOut = (email, list = []) => {
  const e = String(email || '').trim().toLowerCase();
  return Boolean(e) && list.some(o => o.value === e || (o.value.startsWith('@') && e.endsWith(o.value)));
};

export function createLinkTracker({env = process.env, store, clock = () => Date.now(), log = () => {}} = {}) {
  const readState = () => { try { const s = store?.read?.() || {}; return {links: Array.isArray(s.links) ? s.links : [], optOuts: Array.isArray(s.optOuts) ? s.optOuts.filter(o => o && normaliseOptOut(o.value)) : []}; } catch { return {links: [], optOuts: []}; } };
  const readLinks = () => readState().links;
  // Link ids older than LINK_RETENTION_DAYS are dropped whenever the store is saved: the tracker forgets clicks after
  // 90 days, so older ids can no longer match anything.
  const save = state => {
    const cutoff = clock() - LINK_RETENTION_DAYS * 864e5;
    const links = state.links.filter(l => { const t = Date.parse(l.createdAt || ''); return !Number.isFinite(t) || t >= cutoff; });
    store.write({links, optOuts: state.optOuts});
  };

  function status() { const s = linkTrackingSettings(env); return {enabled: s.enabled, ready: s.ready, problems: s.problems}; }

  // Adds tracking to a prepared draft for one queue item. scope 'letter' (used to compare a reviewed letter with
  // an existing Gmail draft) only reuses ids already given out and never adds the footnote.
  async function track(draft, item, {scope = 'all'} = {}) {
    const settings = linkTrackingSettings(env);
    if (!draft || !item?.id) return draft;
    // Comparing a letter with a Gmail draft made while tracking was on still works after switching it off.
    if (!settings.enabled && !(scope === 'letter' && settings.configured)) return draft;
    if (settings.enabled && !settings.ready) fail('Link tracking is switched on but not set up: ' + settings.problems.join('; ') + '. Fix .env or set ENABLE_LINK_TRACKING=false.');
    if (String(draft.bodyPlainText || '').includes(settings.baseUrl + '/c/') || String(draft.bodyHtml || '').includes(settings.baseUrl + '/c/')) return draft;
    // The footnote sits under the Gmail signature; without one there is nowhere honest to put it, so nothing changes.
    if (scope === 'all' && !splitMessage(draft).signed) { log('[LINK_TRACKING] SKIPPED reason=no-signature queue=' + item.id); return draft; }
    const state = readState();
    // A letter already drafted with tracked links still compares like for like after an opt-out.
    if (scope === 'all' && optedOut(item.email, state.optOuts)) { log('[LINK_TRACKING] SKIPPED reason=opted-out queue=' + item.id); return draft; }
    const advertKey = advertLinkKey(item.application?.jobAdvertLink || '');
    const keys = findTrackedLinks(draft, {advertKey, profileTarget: settings.profileTarget, scope});
    if (!keys.length) return draft;

    const links = state.links, added = [], urls = {};
    for (const linkKey of keys) {
      let row = links.find(l => l.queueId === item.id && l.linkKey === linkKey);
      if (!row) {
        if (scope !== 'all') continue;
        row = {id: newLinkId(), linkKey, queueId: item.id, reviewId: item.reviewId || '', applicationKey: item.applicationKey || '', email: String(item.email || '').toLowerCase(), createdAt: new Date(clock()).toISOString()};
        added.push(row);
      }
      urls[linkKey] = settings.baseUrl + '/c/' + await signLinkToken({linkKey, id: row.id, signingKey: settings.signingKey});
    }
    if (!Object.keys(urls).length) return draft;
    if (added.length) {
      const next = [...links, ...added];
      if (next.length > MAX_LINKS) fail('The link-tracking store is full. Archive link-tracking-v1.json before tracking more links.');
      try { save({...state, links: next}); } catch { fail('The link-tracking store could not be saved, so links were not tracked. Nothing was sent.'); }
    }
    const tracked = rewriteTrackedLinks(draft, {advertKey, profileTarget: settings.profileTarget, urls, footnote: scope === 'all', footnoteText: settings.footnote, scope});
    log('[LINK_TRACKING] TRACKED queue=' + item.id + ' links=' + Object.keys(urls).join(','));
    return tracked;
  }

  function optOuts() { return readState().optOuts.map(o => ({value: o.value, at: o.at || ''})).sort((a, b) => a.value.localeCompare(b.value)); }
  // Adds or removes one opt-out (an email address, or @domain for a whole organisation). Saved straight away.
  function setOptOut(value, optOut = true) {
    const v = normaliseOptOut(value);
    if (!v) throw Object.assign(new Error('Enter an email address, or @ and a domain for a whole organisation.'), {code: 'OPT_OUT_INVALID', statusCode: 400});
    const state = readState(), rest = state.optOuts.filter(o => o.value !== v);
    if (rest.length >= 2000 && optOut) throw Object.assign(new Error('The opt-out list is full.'), {code: 'OPT_OUT_FULL', statusCode: 409});
    try { save({...state, optOuts: optOut ? [...rest, {value: v, at: new Date(clock()).toISOString()}] : rest}); }
    catch { throw Object.assign(new Error('The opt-out list could not be saved. Nothing was changed.'), {code: 'OPT_OUT_SAVE', statusCode: 500}); }
    log('[LINK_TRACKING] OPT_OUT ' + (optOut ? 'ADDED' : 'REMOVED'));
    return optOuts();
  }

  // Link ids whose clicks still count: everything except people who opted out.
  function countableLinks() { const state = readState(); return state.links.filter(l => !optedOut(l.email, state.optOuts)); }

  return {status, track, links: readLinks, countableLinks, optOuts, setOptOut};
}
