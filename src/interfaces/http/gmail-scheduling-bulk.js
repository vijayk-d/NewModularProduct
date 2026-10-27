export const MAX_SELECTION=20;
export function eligibleRows(items,filter='drafted'){
 return (Array.isArray(items)?items:[]).filter(i=>i&&i.sendAction?.eligible===true&&(filter==='all'||String(i.status||'').toLowerCase()==='drafted'));
}
export function createSchedulingBatch({request,clock=Date.now,onProgress=()=>{}}){
 let reviews=[],busy=false;
 const publicReviews=()=>reviews.map(x=>({...x}));
 async function release(list){if(!list.length)return;try{await request('discard',{approvals:list.map(x=>x.approval)});}catch{/* No reservation or upload is performed by discard; original reviews expire. */}}
 return {
  get busy(){return busy;},get reviews(){return publicReviews();},
  async discard(){if(busy)throw Error('A batch operation is running.');const old=reviews;reviews=[];await release(old);},
  async prepare({items,dueAt,timeZone}){
   if(busy)throw Error('A batch operation is running.');
   if(!Array.isArray(items)||!items.length||items.length>MAX_SELECTION||new Set(items.map(x=>x.id)).size!==items.length||items.some(x=>x.sendAction?.eligible!==true))throw Error('Select 1–20 distinct eligible emails.');
   if(!Number.isFinite(Date.parse(dueAt))||Date.parse(dueAt)<clock()+120000)throw Error('Choose a shared time at least two minutes ahead.');
   busy=true;const old=reviews;reviews=[];const pending=[];
   try{await release(old);for(const item of items){onProgress('Preparing '+(pending.length+1)+' of '+items.length+'; nothing scheduled yet.');const r=await request('prepare',{queueId:item.id,dueAt,timeZone});if(!r||typeof r.approval!=='string')throw Error('Invalid scheduling review.');pending.push({...r,queueId:item.id});if(Date.parse(r.dueAt)!==Date.parse(dueAt)||r.timeZone!==timeZone)throw Error('Server review time does not match the selected batch time.');}
    if(pending.some(r=>!Number.isFinite(r.expiresAt)||r.expiresAt<=clock()+30000))throw Error('A review is expiring. Prepare the selection again.');
    reviews=pending;return publicReviews();
   }catch(e){await release(pending);throw e;}finally{busy=false;}
  },
  async commit({confirmed=false,repeatQueueIds=[]}={}){
   if(busy)throw Error('A batch operation is running.');if(confirmed!==true||!reviews.length)throw Error('Review and explicitly approve the selected emails first.');
   const repeat=new Set(repeatQueueIds);if(reviews.some(x=>x.mode==='repeat'&&!repeat.has(x.queueId)))throw Error('Explicit repeat-send approval is required for every repeat item.');
   if(reviews.some(x=>x.expiresAt<=clock())){const old=reviews;reviews=[];await release(old);throw Error('Review expired. Nothing submitted by this action.');}
   busy=true;const approved=reviews;reviews=[];const results=[];let next=0;
   try{for(;next<approved.length;next++){const r=approved[next];onProgress('Submitting '+(next+1)+' of '+approved.length+'. Each result is recorded separately.');
     if(r.expiresAt<=clock()){results.push({queueId:r.queueId,state:'NOT_SUBMITTED',note:'Review expired before submission.'});next++;break;}
     try{const response=await request('commit',{approval:r.approval,confirmed:true,repeatApproved:repeat.has(r.queueId)});if(!response?.job?.id)throw Error('Missing schedule receipt.');results.push({queueId:r.queueId,state:response.job.status,job:response.job});if(response.job.status!=='AWAITING_CLOUD'){next++;break;}}
     catch(e){results.push({queueId:r.queueId,state:'UNCONFIRMED',note:'Submission outcome requires reconciliation. Do not schedule this item again.'});next++;break;}
    }
    const untouched=approved.slice(next);await release(untouched);for(const r of untouched)results.push({queueId:r.queueId,state:'NOT_SUBMITTED',note:'Batch stopped; this item was not submitted.'});return results;
   }finally{busy=false;}
  }
 };
}
