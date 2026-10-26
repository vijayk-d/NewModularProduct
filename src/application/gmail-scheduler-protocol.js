import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
export const MAX_RAW=4*1024*1024;
export const MAX_FUTURE=30*24*60*60*1000;
export function schedulerError(message,statusCode=409){return Object.assign(new Error(message),{statusCode});}
export function signingKey(env){const key=String(env.CLOUD_SCHEDULER_SIGNING_KEY||'');if(!/^[a-f0-9]{64}$/.test(key))throw schedulerError('Configure the private scheduler signing key locally.',503);return key;}
export function mac(text,key){return createHmac('sha256',key).update(text,'utf8').digest('hex');}
export function signed(value,key){const text=JSON.stringify(value);return {text,mac:mac(text,key)};}
export function verified(text,signature,key){if(typeof text!=='string'||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))throw schedulerError('Invalid scheduler receipt.');const a=Buffer.from(mac(text,key),'hex'),b=Buffer.from(signature,'hex');if(!timingSafeEqual(a,b))throw schedulerError('Scheduler receipt authentication failed.');return JSON.parse(text);}
export function dueTime(value,now=Date.now()){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value))throw schedulerError('Choose an explicit date/time including timezone offset.',400);const due=Date.parse(value);if(!Number.isFinite(due)||due<now+120000||due>now+MAX_FUTURE)throw schedulerError('Choose a time at least two minutes and at most 30 days ahead.',400);return due;}
export function material(raw){if(typeof raw!=='string'||!raw||raw.length>MAX_RAW||!/^[A-Za-z0-9_-]+={0,2}$/.test(raw))throw schedulerError('Prepared MIME unavailable or exceeds the 4 MiB encoded scheduling limit.',400);return createHash('sha256').update(Buffer.from(raw,'base64url')).digest('hex');}
export function commandRows(command,key){const envelope=signed(command,key),parts=[];for(let i=0;i<envelope.text.length;i+=30000)parts.push(envelope.text.slice(i,i+30000));if(parts.length>150)throw schedulerError('Scheduling request too large.',413);return parts.map((chunk,i)=>[command.requestId,command.jobId,command.action,String(i),String(parts.length),chunk,envelope.mac]);}
