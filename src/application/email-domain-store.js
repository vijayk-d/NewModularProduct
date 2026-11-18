// In-memory email-domain store: the default when no file store is supplied (tests, or a server
// started without a state folder). The running app passes the state-folder file store instead.
export function createEmailDomainStore() {
  const store = new Map();
  return {
    async get(reviewId) { return store.get(reviewId) || null; },
    async save(reviewId, resolution) {
      const value = {...resolution, resolvedAt: new Date().toISOString()};
      store.set(reviewId, value);
      return value;
    }
  };
}
