/** One free trial per organisation. Repeats are blocked by normalized admin email,
 *  phone, hospital name and GSTIN (when captured). Platform owner can clear the block. */
import {Db,HttpError} from './core'

export function normEmail(s:unknown){return String(s||'').trim().toLowerCase()}
export function normPhone(s:unknown){const d=String(s||'').replace(/\D/g,'');if(!d)return '';return d.length>10?d.slice(-10):d}
export function normHospitalName(s:unknown){return String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
export function normGstin(s:unknown){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}

export type TrialKey={kind:'email'|'phone'|'name'|'gstin';norm:string}

export function trialKeys(b:{adminEmail?:unknown;phone?:unknown;hospitalName?:unknown;gstin?:unknown}):TrialKey[]{
 const out:TrialKey[]=[]
 const email=normEmail(b.adminEmail);if(email)out.push({kind:'email',norm:email})
 const phone=normPhone(b.phone);if(phone.length>=10)out.push({kind:'phone',norm:phone})
 const name=normHospitalName(b.hospitalName);if(name.length>=3)out.push({kind:'name',norm:name})
 const gst=normGstin(b.gstin);if(gst.length>=15)out.push({kind:'gstin',norm:gst})
 return out
}

const LABEL:Record<TrialKey['kind'],string>={email:'admin email',phone:'phone',name:'hospital name',gstin:'GSTIN'}

/** Reject a second free trial. Does nothing for paid provisioning (tests and owner-created tenants). */
export async function assertTrialAvailable(db:Db,b:any){
 const keys=trialKeys(b)
 if(!keys.length)return
 const hits:string[]=[]
 for(const k of keys){
  const row=(await db.query('select blocked from trial_claims where kind=$1 and norm=$2',[k.kind,k.norm])).rows[0]
  if(row?.blocked)hits.push(LABEL[k.kind])
 }
 if(!hits.length)return
 throw new HttpError(409,`This organisation already used its one free trial (matched on ${hits.join(', ')}). Sign in and choose a paid plan. Your data is kept — nothing is deleted when a trial expires.`,{trialUsed:true,buyPath:'/auth/login',pricingPath:'/welcome#pricing'})
}

export async function recordTrialClaim(db:Db,hospitalId:string,b:any){
 for(const k of trialKeys(b)){
  await db.query(`insert into trial_claims(hospital_id,kind,norm,blocked) values($1,$2,$3,true)
    on conflict(kind,norm) do update set hospital_id=excluded.hospital_id,blocked=true,reset_at=null,reset_by=null`,[hospitalId,k.kind,k.norm])
 }
}

/** Platform owner: allow this hospital's identities to start a trial again. Audited by the caller. */
export async function resetTrialBlock(db:Db,hospitalId:string,by:string){
 const r=await db.query(`update trial_claims set blocked=false,reset_at=now(),reset_by=$2 where hospital_id=$1 and blocked returning kind`,[hospitalId,by])
 return {cleared:r.rows.length}
}
