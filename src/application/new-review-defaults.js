export function newApplicationPolishingModel(models){
 const matches=(Array.isArray(models)?models:[]).filter(x=>String(x.label||'').trim().toLowerCase()==='gpt-6 luna');
 if(matches.length!==1||typeof matches[0].id!=='string'||!matches[0].id)throw new Error('The application catalogue must contain exactly one GPT-6 Luna entry. No provider identifier is guessed.');
 return matches[0].id;
}
