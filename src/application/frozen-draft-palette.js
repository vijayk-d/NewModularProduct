// Fail closed for explicit frozen palettes; legacy drafts are left to existing checks.
export function assertFrozenDraftPalette(item,bodyHtml){
 const t=item?.application?.emailTheme;if(t==null)return;
 const palette={sky:'#f3f9ff',mint:'#f1faf4',lavender:'#f6f2fc',rose:'#fff3f5',ivory:'#fff8ec',white:'#ffffff'};
 const fail=()=>{throw Object.assign(Error('Gmail draft background differs from the frozen queue palette. Review or recreate the draft; nothing sent.'),{code:'SEND_INTENT_CHANGED',statusCode:409});};
 if(typeof t!=='object'||Array.isArray(t)||t.version!==1||!Object.hasOwn(palette,t.id)||t.backgroundColor!==palette[t.id])fail();
 const c=palette[t.id];
 const prefix='<!-- application-email-theme:v1 --><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="'+c+'" style="width:100%;background-color:'+c+';border-collapse:collapse;"><tbody><tr><td bgcolor="'+c+'" style="background-color:'+c+';color:#152033;padding:16px;">';
 if(typeof bodyHtml!=='string'||!bodyHtml.startsWith(prefix))fail();
}
