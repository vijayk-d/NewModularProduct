export const ADVERTISER_RELATIONSHIPS=Object.freeze(['direct-employer','recruitment-intermediary','unknown']);
export function contextMode(form={}){const v=form.advertiserRelationship||(form.jobImportId?'unknown':'direct-employer');if(!ADVERTISER_RELATIONSHIPS.includes(v))throw new Error('Choose direct employer, recruitment intermediary or unknown.');return v;}
export const usesCandidateValues=form=>contextMode(form)!=='direct-employer';
export function suggestRelationship(description=''){const s=String(description),m=/(?:recruit(?:ing|ment)?\s+on behalf of[^.\n]{0,180}|our client[^.\n]{0,180})/i.exec(s);return m?{suggested:'recruitment-intermediary',evidence:m[0],confirmed:false}:{suggested:'unknown',evidence:'No reliable relationship evidence identified.',confirmed:false};}
