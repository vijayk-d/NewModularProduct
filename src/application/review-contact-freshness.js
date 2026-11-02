function timestamp(v){if(typeof v==='number'&&Number.isFinite(v))return v;const n=Date.parse(v);return Number.isFinite(n)?n:0;}
export function newlyImportedForReview(contact,review){const baseline=timestamp(review?.createdAt);if(!baseline)return true;return Math.max(timestamp(contact.lastImportedAt),timestamp(contact.firstImportedAt))>=baseline;}
