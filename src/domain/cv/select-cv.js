import { scoreCvAgainstJd } from './score-cv-against-jd.js';

function candidatesFrom(inventory = {}) {
  return inventory.cv_inventory?.cvs || inventory.cvs || [];
}

function preferenceRank(roleCode, preferredRoleCodes) {
  const index = preferredRoleCodes.indexOf(roleCode);

  return index === -1
    ? preferredRoleCodes.length
    : index;
}

export function rankCvCandidates(
  jobDescription,
  inventory,
  preferredRoleCodes = []
) {
  const cvs = candidatesFrom(inventory);

  if (!cvs.length) {
    throw new Error('CV inventory contains no CV entries.');
  }

  return cvs
    .map((cv, originalIndex) => ({
      cv,
      ats: scoreCvAgainstJd(jobDescription, cv),
      originalIndex
    }))
    .sort((left, right) => {
      const scoreDifference = right.ats.score - left.ats.score;

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      const preferenceDifference =
        preferenceRank(left.cv.role_code, preferredRoleCodes) -
        preferenceRank(right.cv.role_code, preferredRoleCodes);

      if (preferenceDifference !== 0) {
        return preferenceDifference;
      }

      return left.originalIndex - right.originalIndex;
    })
    .map(({ originalIndex, ...candidate }) => candidate);
}

export function selectCv(
  jobDescription,
  inventory,
  preferredRoleCodes = []
) {
  const ranked = rankCvCandidates(
    jobDescription,
    inventory,
    preferredRoleCodes
  );

  return {
    bestCv: ranked[0].cv,
    alternativeCv: ranked[1]?.cv ?? null,
    ats: ranked[0].ats
  };
}
