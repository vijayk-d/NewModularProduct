// Link-click tracking, Stage 2: when an email is prepared for Gmail (send or draft), the LinkedIn advert link in the
// letter and the LinkedIn profile link in the signature become signed tracker links, and the disclosure footnote is
// added under the signature. Off unless ENABLE_LINK_TRACKING=true. Nothing is sent or retried here.
//
// Each queue item keeps the same random id per link, so preparing the same email again gives the same message.
// Which id belongs to which application and recipient stays in the local store, never at the tracker.
import {newLinkId, signLinkToken, advertLinkKey, targetFor} from '../domain/outreach/link-tokens.js';
import {findTrackedLinks, rewriteTrackedLinks, splitMessage, LINK_TRACKING_FOOTNOTE} from '../domain/outreach/tracked-links.js';

const MAX_LINKS = 20000;
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

export function createLinkTracker({env = process.env, store, clock = () => Date.now(), log = () => {}} = {}) {
  const readLinks = () => { try { const s = store?.read?.() || {}; return Array.isArray(s.links) ? s.links : []; } catch { return []; } };

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
    const advertKey = advertLinkKey(item.application?.jobAdvertLink || '');
    const keys = findTrackedLinks(draft, {advertKey, profileTarget: settings.profileTarget, scope});
    if (!keys.length) return draft;

    const links = readLinks(), added = [], urls = {};
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
      try { store.write({links: next}); } catch { fail('The link-tracking store could not be saved, so links were not tracked. Nothing was sent.'); }
    }
    const tracked = rewriteTrackedLinks(draft, {advertKey, profileTarget: settings.profileTarget, urls, footnote: scope === 'all', footnoteText: settings.footnote, scope});
    log('[LINK_TRACKING] TRACKED queue=' + item.id + ' links=' + Object.keys(urls).join(','));
    return tracked;
  }

  return {status, track, links: readLinks};
}
