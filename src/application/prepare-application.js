import { parseJobDescription } from '../domain/job-description/parse-job-description.js';
import { selectCvsByPath } from '../domain/cv/select-cvs-by-path.js';
import {
  rankCvCandidates,
  selectCv
} from '../domain/cv/select-cv.js';
import { generateCoverLetter } from '../domain/cover-letter/generate-cover-letter.js';

export function prepareApplication({
  jobDescriptionText = '',
  inventory = {},
  selectedCvPaths = [],
  preferredRoleCodes = [],
  jobDescriptionOverrides = {},
  coverLetterTemplate,
  candidateProfile = {},
  recruiterName = '',
  recruiter = {},
  companyValues = [],
  jobAdvertLink = '',
  jobReference = '',
  variant = 'default',
  variantProfiles = {},
  domainMapping = {},
  cvHighlights = [],
  jdKeywords = [],
  refinedCoverLetter = '',
  finalCoverLetter = '',
  highlightPhrases = []
} = {}) {
  const jobDescription = parseJobDescription(
    jobDescriptionText,
    jobDescriptionOverrides
  );

  const selectedInventory = selectCvsByPath(
    inventory,
    selectedCvPaths
  );

  const rankedCvs = rankCvCandidates(
    jobDescription,
    selectedInventory,
    preferredRoleCodes
  );

  const recommendation = selectCv(
    jobDescription,
    selectedInventory,
    preferredRoleCodes
  );

  const coverLetter = generateCoverLetter({
    template: coverLetterTemplate,
    jobDescription,
    cv: recommendation.bestCv,
    candidateProfile,
    recruiterName,
    recruiter,
    companyValues,
    finalCoverLetter,
    refinedCoverLetter,
    atsScore: recommendation.ats,
    cvHighlights,
    jdKeywords,
    domainMapping,
    variantProfiles,
    variant,
    jobAdvertLink,
    jobReference,
    highlightPhrases
  });

  return {
    jobDescription,
    selectedInventory,
    rankedCvs,
    recommendation,
    coverLetter
  };
}
