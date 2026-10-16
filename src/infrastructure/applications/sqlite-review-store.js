import {currentReviewSubject} from '../../application/review-subject.js';
import {DatabaseSync} from 'node:sqlite';import {mkdirSync} from 'node:fs';import path from 'node:path';
import {createDurableReviewStore,reviewStoreError} from '../../application/durable-review-store.js';
export function createSqliteReviewStore({filePath,clock=()=>new Date().toISOString()}={}){
 if(typeof filePath!=='string'||!filePath.trim())throw reviewStoreError('An explicit application database path is required.');
 if(filePath!==':memory:')mkdirSync(path.dirname(filePath),{recursive:true});
 const db=new DatabaseSync(filePath);db.exec(`CREATE TABLE IF NOT EXISTS application_reviews(review_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,job_title TEXT NOT NULL,organisation TEXT NOT NULL,subject TEXT NOT NULL,cv_code TEXT NOT NULL,advert_url TEXT NOT NULL,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS deleted_application_reviews(review_id TEXT PRIMARY KEY,deleted_at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS application_reviews_updated ON application_reviews(updated_at);`);
 const read=id=>{let row;try{row=db.prepare('SELECT revision,payload FROM application_reviews WHERE review_id=?').get(id);}catch{throw reviewStoreError('Saved application could not be read.','REVIEW_STORE_READ_FAILED');}if(!row)return undefined;try{return {revision:row.revision,value:JSON.parse(row.payload)};}catch{throw reviewStoreError('Saved application JSON is invalid. Do not clear the database.');}};
 const repository={read,durable:true,
  remove(id,revision){db.exec('BEGIN IMMEDIATE');try{const row=db.prepare('SELECT revision FROM application_reviews WHERE review_id=?').get(id);if(!row)throw reviewStoreError('Application missing/deleted.','REVIEW_STORE_DELETED',404);if(row.revision!==revision)throw reviewStoreError('Application changed.','REVIEW_STORE_CONFLICT',409);db.prepare('INSERT INTO deleted_application_reviews VALUES(?,?)').run(id,clock());db.prepare('DELETE FROM application_reviews WHERE review_id=? AND revision=?').run(id,revision);db.exec('COMMIT');return {deleted:true};}catch(e){db.exec('ROLLBACK');throw e;}},
  write(id,revision,value){let begun=false;try{db.exec('BEGIN IMMEDIATE');begun=true;
   if(db.prepare('SELECT review_id FROM deleted_application_reviews WHERE review_id=?').get(id))throw reviewStoreError('Application permanently deleted; stale saves cannot recreate it.','REVIEW_STORE_DELETED',410);
   const row=db.prepare('SELECT revision,created_at FROM application_reviews WHERE review_id=?').get(id);if((row?.revision||0)!==revision)throw reviewStoreError('Application revision changed.','REVIEW_STORE_CONFLICT',409);
   const now=clock(),created=row?.created_at||now;let subject;try{subject=currentReviewSubject(value);}catch{subject=String(value.currentDraftSubject||value.prepared?.coverLetter?.subject||'').slice(0,300);}
   db.prepare(`INSERT INTO application_reviews VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(review_id) DO UPDATE SET revision=excluded.revision,updated_at=excluded.updated_at,job_title=excluded.job_title,organisation=excluded.organisation,subject=excluded.subject,cv_code=excluded.cv_code,advert_url=excluded.advert_url,payload=excluded.payload`).run(id,revision+1,created,now,String(value.formData?.jobTitle||'').slice(0,500),String(value.formData?.organisationName||'').slice(0,500),subject,String(value.selectedCvRoleCode||'').slice(0,200),String(value.formData?.jobAdvertLink||'').slice(0,2000),JSON.stringify(value));
   db.exec('COMMIT');
  }catch(e){if(begun)db.exec('ROLLBACK');if(String(e.code||'').startsWith('REVIEW_STORE_'))throw e;throw reviewStoreError('Saved application transaction failed. No data was overwritten.','REVIEW_STORE_WRITE_FAILED');}},
  summaries({query='',page=1,size=20}={}){
   const q=String(query).trim().toLowerCase().slice(0,200),rows=db.prepare(`SELECT review_id AS id,revision,created_at AS createdAt,updated_at AS updatedAt,job_title AS jobTitle,organisation,subject,cv_code AS cvCode,advert_url AS advertUrl FROM application_reviews ORDER BY updated_at DESC,review_id`).all().filter(r=>!q||[r.jobTitle,r.organisation,r.subject].some(v=>v.toLowerCase().includes(q)));
   const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(pages,Math.max(1,Number(page)||1));return {items:rows.slice((current-1)*size,current*size),total:rows.length,page:current,pages};
  },close(){db.close();}
 };
 return createDurableReviewStore(repository);
}
