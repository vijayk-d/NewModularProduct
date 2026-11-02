export function createFakeCompanyResearchAdapter({
  result,
  calls = [],
  error = null
} = {}) {
  return {
    async research(request) {
      calls.push(request);

      if (error) {
        throw error;
      }

      return result;
    }
  };
}