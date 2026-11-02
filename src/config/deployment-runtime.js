import path from 'node:path';
export function deploymentRuntime({env=process.env,projectRoot}={}){
 const mode=String(env.NMP_ENV||'development'),root=path.resolve(projectRoot);
 if(!['development','verification','production'].includes(mode))throw new Error('Invalid NMP_ENV.');
 const flags=['ENABLE_GMAIL','ENABLE_GMAIL_SENDING','ENABLE_GMAIL_DRAFT_CREATION','ENABLE_GMAIL_DRAFT_UPDATES','ENABLE_GMAIL_MAILBOX_CHECK','ENABLE_GMAIL_SIGNATURE','ENABLE_PERPLEXITY_RESEARCH','ENABLE_COVER_LETTER_REFINEMENT'];
 if(mode!=='production'&&env.NMP_ALLOW_DEVELOPMENT_INTEGRATIONS!=='true')for(const k of flags)env[k]='false';
 const on=k=>['true','1','yes'].includes(String(env[k]||'').toLowerCase());
 if(!on('ENABLE_PERPLEXITY_RESEARCH')&&!on('ENABLE_COVER_LETTER_REFINEMENT'))env.PERPLEXITY_API_KEY='';
 if(!flags.filter(k=>k.includes('GMAIL')).some(on))for(const k of ['GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET','GMAIL_OAUTH_REFRESH_TOKEN','GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET'])env[k]='';
 const supplied=String(env.NMP_STATE_DIRECTORY||''),state=path.resolve(supplied||path.join(root,'output')),relative=path.relative(root,state);
 if(mode==='production'&&(!path.isAbsolute(supplied)||!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))))throw new Error('Production requires absolute persistent storage outside the release.');
 return {mode,state,contacts:path.join(state,'imported-recruiter-contacts.json'),outreach:path.join(state,'outreach.db'),reviews:path.join(state,'application-reviews-v1.db'),imports:path.join(state,'job-imports-v1.db')};
}
