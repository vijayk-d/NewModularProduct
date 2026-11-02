export function createFakeCoverLetterRefinementAdapter({
  result,
  calls = [],
  error = null
} = {}) {
  return {
    async refine(request) {
      calls.push(request);

      if (error) {
        throw error;
      }

      return result;
    }
  };
}