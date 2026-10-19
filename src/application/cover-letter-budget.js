import {composeOutreachLetter} from './compose-outreach-letter.js';
import {lengthPolicy,letterWordCount} from '../domain/cover-letter/letter-quality-policy.js';
export function coverLetterBudget(request={}){
 const policy=lengthPolicy(request.letterLengthMode,request.maxWords??500);let protectedWords=0;
 if(request.protectOutreachStructure===true){const shell=composeOutreachLetter({draft:'QUALITY_EXPERIENCE_SENTINEL',jobTitle:request.applicationJobTitle||request.jobDescriptionSummary,organisationName:request.organisationName,advertUrl:request.jobAdvertLink,candidateName:request.candidateDisplayName,allowUnknownOrganisation:request.allowUnknownOrganisation===true,advertiserRelationship:request.advertiserRelationship||'direct-employer',excludedEmployers:request.excludedEmployers});protectedWords=letterWordCount(shell,{advertUrl:request.jobAdvertLink})-1;}
 const maximumExperienceWords=policy.maximumWords-protectedWords;
 if(maximumExperienceWords<1){const e=new Error('Protected sections exhaust the configured word budget. Revise the configuration; no provider call was made.');e.code='REFINEMENT_LENGTH_INVALID';throw e;}
 return {...policy,protectedWords,minimumExperienceWords:Math.max(0,policy.targetMinimum-protectedWords),maximumExperienceWords};
}
