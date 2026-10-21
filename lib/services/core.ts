export type Db={query:(text:string,params?:unknown[])=>Promise<{rows:any[]}>}
export type Role='admin'|'reception'|'doctor'|'nurse'|'lab'|'pharmacy'|'billing'|'patient'
export type Ctx={hospitalId:string;userId:string;role:Role}
export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
/** Hospital admin is a superuser: allowed everywhere a staff role is (actions are audit-logged by the API layer). */
export function requireRole(ctx:Ctx,roles:Role[]){if(ctx.role==='admin'&&!roles.includes('patient' as Role))return;if(!roles.includes(ctx.role))throw new HttpError(403,'Your role ('+ctx.role+') cannot perform this action.')}
export function required(v:unknown,name:string):string{const s=typeof v==='string'?v.trim():v==null?'':String(v).trim();if(!s)throw new HttpError(400,name+' is required.');return s}
export const opt=(v:unknown)=>{const s=v==null?'':String(v).trim();return s||null}
export function num(v:unknown,name:string,{min=0,allowNull=true}:{min?:number;allowNull?:boolean}={}):number|null{if(v===''||v==null){if(allowNull)return null;throw new HttpError(400,name+' is required.')}const n=Number(v);if(!Number.isFinite(n)||n<min)throw new HttpError(400,name+' must be a number ≥ '+min+'.');return n}
export async function nextCounter(db:Db,hospitalId:string,name:string,period=''){const r=await db.query('insert into hospital_counters(hospital_id,name,period,last_value) values($1,$2,$3,1) on conflict(hospital_id,name,period) do update set last_value=hospital_counters.last_value+1 returning last_value',[hospitalId,name,period]);return Number(r.rows[0].last_value)}
export async function uhidPrefix(db:Db,hospitalId:string){const r=await db.query('select coalesce(uhid_prefix,code) p from hospitals where id=$1',[hospitalId]);if(!r.rows[0])throw new HttpError(404,'Hospital not found');return String(r.rows[0].p)}
export async function audit(db:Db,ctx:Ctx,action:string,entity:string,entityId:string|null,details?:unknown){await db.query('insert into audit_log(hospital_id,user_id,action,entity,entity_id,details) values($1,$2,$3,$4,$5,$6)',[ctx.hospitalId,ctx.userId,action,entity,entityId,details==null?null:JSON.stringify(details)])}
export async function assertPatient(db:Db,ctx:Ctx,patientId:unknown){const id=required(patientId,'Patient');const r=await db.query('select id,uhid,full_name from patients where id=$1 and hospital_id=$2',[id,ctx.hospitalId]);if(!r.rows[0])throw new HttpError(404,'Patient not found.');return r.rows[0]}
export async function assertDoctor(db:Db,ctx:Ctx,doctorId:unknown){const id=required(doctorId,'Doctor');const r=await db.query("select id,full_name from users where id=$1 and hospital_id=$2 and role='doctor' and active=true",[id,ctx.hospitalId]);if(!r.rows[0])throw new HttpError(404,'Doctor not found.');return r.rows[0]}
export const today=()=>new Date(Date.now()+330*60000).toISOString().slice(0,10) // IST date
