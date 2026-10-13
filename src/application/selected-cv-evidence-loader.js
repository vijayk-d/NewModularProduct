export function createSelectedCvEvidenceLoader({ inventoryRepository, documentExtractor, linkedinRelativePath = '' }) {
  if (typeof inventoryRepository?.load !== 'function' || typeof documentExtractor?.extract !== 'function') {
    throw new Error('CV evidence requires inventory and document adapters.');
  }
  return async function loadEvidence(review) {
    const fail = () => {
      const error = new Error('Selected CV evidence is unavailable. Check the selected CV, CV_FOLDER configuration and PDF text extraction, then retry. No polishing request was sent.');
      error.code = 'CV_EVIDENCE_UNAVAILABLE'; return error;
    };
    try {
      const code = String(review?.selectedCvRoleCode || review?.prepared?.recommendation?.bestCv?.role_code || '').trim();
      const inventory = await inventoryRepository.load();
      const cv = (inventory.cv_inventory?.cvs || inventory.cvs || []).find(item => item.role_code === code);
      if (!cv?.local_path) throw fail();
      const extracted = await documentExtractor.extract({ relativePath: cv.local_path });
      const text = String(extracted?.text || '').trim();
      if (!text || text.length > 120000) throw fail();
      const jobDescriptionText = String(review.formData?.jobDescriptionText || '').trim();
      if (!jobDescriptionText) throw fail();
      let profileEvidence = {};
      if (linkedinRelativePath) {
        let profile;
        try {
          profile = await documentExtractor.extract({ relativePath: linkedinRelativePath });
        } catch {
          const error = new Error('LinkedIn profile PDF extraction failed. Check CANDIDATE_LINKEDIN_PDF and the file under CV_FOLDER. No polishing request was sent.');
          error.code = 'LINKEDIN_EVIDENCE_UNAVAILABLE'; throw error;
        }
        const profileText = String(profile?.text || '').trim();
        if (!profileText || profileText.length > 120000) {
          const error = new Error('LinkedIn profile PDF text is empty or exceeds 120000 characters. No polishing request was sent.');
          error.code = 'LINKEDIN_EVIDENCE_UNAVAILABLE'; throw error;
        }
        profileEvidence = { candidateLinkedInText: profileText };
      }
      return {
        ...(review.formData?.jobTitle ? {
          applicationJobTitle: String(review.formData.jobTitle).trim(),
          jobAdvertLink: String(review.formData.jobAdvertLink || '').trim(),
          protectOutreachStructure: true
        } : {}),
        ...profileEvidence, selectedCvText: text, jobDescriptionText, candidateDisplayName: 'Vijay DAFAL' };
    } catch (error) {
      if (error.code === 'LINKEDIN_EVIDENCE_UNAVAILABLE') throw error;
      throw fail();
    }
  };
}
