import { parseJobDescription } from '../domain/job-description/parse-job-description.js';
import { scoreCvAgainstJd } from '../domain/cv/score-cv-against-jd.js';

export function recommendCvs({
  jobDescriptionText = '',
  cvs = [],
  overrides = {}
} = {}) {
  const jobDescription = parseJobDescription(jobDescriptionText, overrides);

  const rankedCvs = cvs
    .map((cv, originalIndex) => ({
      cv,
      originalIndex,
      assessment: scoreCvAgainstJd(jobDescription, cv)
    }))
    .sort((left, right) => {
      const scoreDifference = right.assessment.score - left.assessment.score;
      return scoreDifference || left.originalIndex - right.originalIndex;
    })
    .map(({ originalIndex, ...result }) => result);

  return {
    jobDescription,
    rankedCvs
  };
}