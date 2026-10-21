import crypto from 'node:crypto';import {Db,HttpError} from './core'
/** Website demo requests → platform CRM pipeline. Public create is validated + rate-limited per IP (hashed, never stored raw). */
export const STAGES=['new','contacted','demo','trial','won','lost'] as const
const s=(v:any,n=200)=>String(v??'').trim().slice(0,n)
export async function createLead(db:Db,b:any,ip=''){const name=s(b.name,120),hospital=s(b.hospitalName,160),phone=s(b.phone,20).replace(/[^\d+]/g,''),email=s(b.email,160).toLowerCase()
 if(s(b.website))return {ok:true} // honeypot
 if(name.length<2||hospital.length<2)throw new HttpError(400,'Please enter your name and hospital.');if(!/^\+?\d{10,13}$/.test(phone))throw new HttpError(400,'Enter a valid mobile number.');if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw new HttpError(400,'Enter a valid e-mail.')
 const ipHash=ip?crypto.createHash('sha256').update('lead:'+ip).digest('hex').slice(0,32):null
 if(ipHash&&Number((await db.query("select count(*) n from saas_leads where ip_hash=$1 and created_at>now()-interval '1 hour'",[ipHash])).rows[0].n)>=5)throw new HttpError(429,'Too many requests. Please call us instead.')
 const beds=Number.isFinite(Number(b.beds))&&Number(b.beds)>0?Math.min(5000,Math.round(Number(b.beds))):null
 await db.query('insert into saas_leads(name,hospital_name,phone,email,city,beds,message,source,ip_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[name,hospital,phone,email||null,s(b.city,80)||null,beds,s(b.message,1000)||null,s(b.source,40)||'website',ipHash]);return {ok:true}}
export async function listLeads(db:Db){const rows=(await db.query('select id,name,hospital_name,phone,email,city,beds,message,source,status,notes,next_follow_up,created_at,updated_at from saas_leads order by created_at desc limit 500')).rows
 const counts=Object.fromEntries(STAGES.map(k=>[k,rows.filter((r:any)=>r.status===k).length]));return {leads:rows,counts,stages:STAGES}}
export async function updateLead(db:Db,id:string,b:any){const st=b.status!==undefined?s(b.status,20):null;if(st&&!(STAGES as readonly string[]).includes(st))throw new HttpError(400,'Unknown stage')
 const fu=b.nextFollowUp===undefined?undefined:(b.nextFollowUp?s(b.nextFollowUp,10):null);if(fu&&!/^\d{4}-\d{2}-\d{2}$/.test(fu))throw new HttpError(400,'Bad date')
 const r=await db.query('update saas_leads set status=coalesce($2,status),notes=case when $3::boolean then $4 else notes end,next_follow_up=case when $5::boolean then $6::date else next_follow_up end,updated_at=now() where id=$1 returning id',[id,st,b.notes!==undefined,b.notes!==undefined?s(b.notes,2000):null,fu!==undefined,fu??null]);if(!r.rows.length)throw new HttpError(404,'Lead not found');return {ok:true}}
