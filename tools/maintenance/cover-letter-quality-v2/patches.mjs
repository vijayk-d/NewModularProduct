export const TARGETS=[
  {
    "path": "src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js",
    "gitBlob": "47b18638db973035d137331064738f477c1905ec",
    "patches": [
      {
        "before": "import {SENIOR_COVER_LETTER_INSTRUCTIONS} from '../../application/senior-cover-letter-instructions.js';",
        "after": "// COVER_LETTER_QUALITY_V2_INTEGRATION\nimport {qualityV2Enabled,QUALITY_V2_INSTRUCTIONS,evidenceContractForPrompt,extendQualityV2Schema,validateQualityV2,qualityV2Review,reconcileQualityV2,qualityV2RoleFocus} from '../../application/cover-letter-quality-v2.js';\nimport {SENIOR_COVER_LETTER_INSTRUCTIONS} from '../../application/senior-cover-letter-instructions.js';"
      },
      {
        "before": "    task: \"Propose a refined UK cover letter\",",
        "after": "    task: \"Propose a refined UK cover letter\",\n    ...(qualityV2Enabled()?{evidenceContract:evidenceContractForPrompt(request)}:{}),"
      },
      {
        "before": "    roleFocus: roleFocusPolicy(request),",
        "after": "    roleFocus: qualityV2RoleFocus(request,roleFocusPolicy(request)),"
      },
      {
        "before": "      finalNarrativeParagraphs:'Motivation opening, 2–3 literal • evidence bullets, employer alignment, and one paragraph with three prospective 3–6-month focus areas. No rigid paragraph quota; local closing is protected.',",
        "after": "      finalNarrativeParagraphs:qualityV2Enabled()?'Motivation opening, up to three supported literal • evidence bullets, employer alignment, and one paragraph with three prospective 3–6-month focus areas. Two or three bullets are desirable only if supported; no padding or rigid paragraph quota. Local closing is protected.':'Motivation opening, 2–3 literal • evidence bullets, employer alignment, and one paragraph with three prospective 3–6-month focus areas. No rigid paragraph quota; local closing is protected.',"
      },
      {
        "before": "text: SENIOR_COVER_LETTER_INSTRUCTIONS+",
        "after": "text: (qualityV2Enabled()?QUALITY_V2_INSTRUCTIONS:SENIOR_COVER_LETTER_INSTRUCTIONS)+"
      },
      {
        "before": "schema: responseSchema()",
        "after": "schema: qualityV2Enabled()?extendQualityV2Schema(responseSchema()):responseSchema()"
      },
      {
        "before": "  if (!request.protectOutreachStructure) assertLetterBodySafe(proposedDraft, request.excludedEmployers);",
        "after": "  const evidenceAudit=qualityV2Enabled()?validateQualityV2(result,request,proposedDraft):null;\n  if (!request.protectOutreachStructure) assertLetterBodySafe(proposedDraft, request.excludedEmployers);"
      },
      {
        "before": "  return {\n    quality,letterLengthMode:quality.mode,qualityAdvertUrl:request.jobAdvertLink||'',",
        "after": "  if(evidenceAudit) quality=reconcileQualityV2(quality);\n  return {\n    ...(evidenceAudit?{evidenceAudit}:{}),\n    quality,letterLengthMode:quality.mode,qualityAdvertUrl:request.jobAdvertLink||'',"
      },
      {
        "before": "      suggestedChanges: normalizeStringArray(result?.warnings)\n    },",
        "after": "      suggestedChanges: normalizeStringArray(result?.warnings),\n      ...(evidenceAudit?qualityV2Review(evidenceAudit,result?.warnings):{})\n    },"
      },
      {
        "before": "    warnings:[...normalizeStringArray(result?.warnings),...roleConsistencyWarnings(proposedDraft,request.applicationJobTitle||request.jobDescriptionSummary)],",
        "after": "    warnings:[...normalizeStringArray(result?.warnings),...roleConsistencyWarnings(proposedDraft,request.applicationJobTitle||request.jobDescriptionSummary),...(evidenceAudit?.warnings||[])],"
      }
    ]
  },
  {
    "path": "src/application/refinement-error-details.js",
    "gitBlob": "61bdf09a8010ee646d69de97558bf6b570cec81e",
    "patches": [
      {
        "before": "  let message = safeMessages.has(error?.message) ? error.message : 'Cover-letter refinement is currently unavailable.';",
        "after": "  let message = safeMessages.has(error?.message) ? error.message : ['REFINEMENT_EVIDENCE_V2_REJECTED','REFINEMENT_EVIDENCE_V2_INPUT'].includes(details.errorCode) ? 'The v2 evidence audit failed its source, permission or completeness checks. Current letter unchanged. No automatic paid retry.' : 'Cover-letter refinement is currently unavailable.';"
      }
    ]
  }
];
