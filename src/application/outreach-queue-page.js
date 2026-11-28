// Server-side paging for the outreach queue: filters and sorting apply first, then one page is cut.
// Pure functions, so the list endpoint only enriches the rows it actually returns.

export const QUEUE_PAGE_SIZES = Object.freeze([25, 50, 100, 200]);
export const QUEUE_DEFAULT_PAGE_SIZE = 50;
export const QUEUE_MAX_PAGE_SIZE = 500;
export const QUEUE_SORTS = Object.freeze(['queued', 'newest', 'name', 'status', 'organisation']);

function integer(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : NaN;
}

// Reads paging options from URL search params. limit is null when absent: the caller then returns every row,
// which keeps older callers (bulk send, scheduling, tests) working unchanged.
export function parseQueuePageQuery(searchParams) {
  const get = name => searchParams.get(name);
  const limit = integer(get('limit'), null), offset = integer(get('offset'), 0);
  if (limit !== null && (!Number.isSafeInteger(limit) || limit < 1 || limit > QUEUE_MAX_PAGE_SIZE)) {
    throw Object.assign(new Error(`limit must be a whole number from 1 to ${QUEUE_MAX_PAGE_SIZE}.`), { statusCode: 400 });
  }
  if (!Number.isSafeInteger(offset) || offset < 0) throw Object.assign(new Error('offset must be a whole number of 0 or more.'), { statusCode: 400 });
  const sort = get('sort') || 'queued';
  if (!QUEUE_SORTS.includes(sort)) throw Object.assign(new Error('Unknown sort order.'), { statusCode: 400 });
  const filter = get('filter') || '';
  if (filter && filter !== 'schedulable') throw Object.assign(new Error('Unknown queue filter.'), { statusCode: 400 });
  return {
    q: String(get('q') || '').trim().toLowerCase().slice(0, 200),
    status: String(get('status') || '').trim().slice(0, 40),
    sort, filter, limit, offset
  };
}

const searchText = item => [item.fullName, item.email, item.role, item.subject,
  item.application?.organisationName, item.application?.jobTitle].map(v => String(v || '').toLowerCase()).join('\n');

// Search and status filters that need only the stored row.
export function filterQueueItems(items, { q = '', status = '' } = {}) {
  return items.filter(item => (!status || item.status === status) && (!q || searchText(item).includes(q)));
}

// The same test the bulk Send and Schedule buttons use for one row (see partitionQueueSelection).
export function isSchedulableQueueItem(item) {
  if (!item || (item.letterGate && item.letterGate.allowed === false)) return false;
  if (item.status === 'sent' || item.sendAction?.mode === 'repeat') return false;
  return item.sendAction?.eligible === true && ['new', 'draft'].includes(item.sendAction.mode);
}

const collator = new Intl.Collator('en-GB', { sensitivity: 'base', numeric: true });
const sortKeys = {
  name: item => item.fullName || item.email || '',
  status: item => item.status || '',
  organisation: item => item.application?.organisationName || ''
};

// Stable sort; 'queued' keeps the repository order (oldest first) and 'newest' reverses it.
export function sortQueueItems(items, sort = 'queued') {
  if (sort === 'newest') return [...items].reverse();
  const key = sortKeys[sort];
  if (!key) return [...items];
  return items.map((item, index) => ({ item, index }))
    .sort((a, b) => collator.compare(key(a.item), key(b.item)) || a.index - b.index).map(entry => entry.item);
}

// Cuts one page. An offset past the end moves back to the start of the last page, so deleting the
// last rows of a page never leaves an empty view.
export function pageQueueItems(items, { limit = null, offset = 0 } = {}) {
  const total = items.length;
  if (limit === null) return { items, total, offset: 0, limit: null };
  const lastStart = total ? Math.floor((total - 1) / limit) * limit : 0;
  const start = Math.min(Math.max(0, offset), lastStart);
  return { items: items.slice(start, start + limit), total, offset: start, limit };
}

export function queueStatuses(items) {
  return [...new Set(items.map(item => item.status).filter(Boolean))].sort();
}
