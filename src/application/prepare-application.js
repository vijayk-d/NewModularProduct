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
  selectedCvRoleCode = '',
  selectedAchievementStatements = null,
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

  let recommendation = selectCv(
    jobDescription,
    selectedInventory,
    preferredRoleCodes
  );

  if(selectedCvRoleCode){const selected=rankedCvs.find(x=>x.cv.role_code===selectedCvRoleCode);if(!selected)throw new Error('The evidence CV is not in this inventory.');recommendation={bestCv:selected.cv,ats:selected.ats,alternativeCv:rankedCvs.find(x=>x.cv.role_code!==selectedCvRoleCode)?.cv||null};}
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
    selectedAchievementStatements,
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
