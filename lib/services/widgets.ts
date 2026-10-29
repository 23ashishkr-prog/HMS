/** Customisable home: widget library filtered by role, per-user layout (order + size), hospital default per role (admin). */
import {Ctx,Db,HttpError,Role,audit,requireRole,today} from './core'
import {doctorStatuses} from './doctorsched'
export type Size='s'|'m'|'l'
export type Item={id:string;size:Size}
type W={id:string;title:string;roles:Role[];size:Size;desc:string}
const ALL:Role[]=['admin','reception','doctor','nurse','lab','pharmacy','billing']
export const WIDGETS:W[]=[
 {id:'quick_actions',title:'Quick actions',roles:ALL,size:'l',desc:'Shortcuts for your role'},
 {id:'kpi_patients',title:'Patients today',roles:['admin','reception','doctor','nurse','billing'],size:'s',desc:'Registered and seen today'},
 {id:'opd_queue',title:'OPD queue',roles:['admin','reception','doctor','nurse'],size:'m',desc:'Live tokens (doctors: your own)'},
 {id:'appointments',title:'Appointments today',roles:['admin','reception','doctor'],size:'m',desc:'Upcoming bookings'},
 {id:'doctor_availability',title:'Doctor availability',roles:['admin','reception','nurse'],size:'m',desc:'Who is in now'},
 {id:'beds',title:'Beds',roles:['admin','reception','doctor','nurse','billing'],size:'s',desc:'Occupied / total'},
 {id:'collections',title:"Today's collections",roles:['admin','billing','reception'],size:'s',desc:'Payments received today'},
 {id:'unpaid',title:'Unpaid bills',roles:['admin','billing'],size:'s',desc:'Open invoices'},
 {id:'pending_labs',title:'Pending lab / radiology',roles:['admin','lab','doctor'],size:'s',desc:'Ordered + collected'},
 {id:'low_stock',title:'Low stock',roles:['admin','pharmacy'],size:'m',desc:'At or below reorder level'},
 {id:'expiring',title:'Expiring soon',roles:['admin','pharmacy'],size:'s',desc:'Batches expiring in 60 days'},
 {id:'reminders',title:'Follow-ups & reminders',roles:['admin','reception','doctor'],size:'m',desc:'Follow-ups awaiting confirmation'}]
const DEF:Record<string,string[]>={admin:['quick_actions','kpi_patients','collections','beds','pending_labs','opd_queue','appointments','doctor_availability','unpaid','reminders'],reception:['quick_actions','kpi_patients','collections','opd_queue','doctor_availability','appointments'],doctor:['quick_actions','opd_queue','appointments','pending_labs','reminders'],nurse:['quick_actions','opd_queue','beds','doctor_availability'],lab:['quick_actions','pending_labs'],pharmacy:['quick_actions','low_stock','expiring'],billing:['quick_actions','collections','unpaid','beds']}
export const allowed=(role:Role)=>WIDGETS.filter(w=>w.roles.includes(role)||role==='admin')
export const roleDefault=(role:Role):Item[]=>(DEF[role]||['quick_actions']).map(id=>({id,size:WIDGETS.find(w=>w.id===id)!.size}))
export function clean(role:Role,layout:any):Item[]{if(!Array.isArray(layout))throw new HttpError(400,'Layout must be a list.');const ok=new Set(allowed(role).map(w=>w.id)),seen=new Set<string>();const out:Item[]=[];for(const x of layout.slice(0,30)){const id=String(x?.id||'');if(!ok.has(id)||seen.has(id))continue;seen.add(id);out.push({id,size:(['s','m','l'].includes(x?.size)?x.size:'m') as Size})}return out}
export async function getLayout(db:Db,ctx:Ctx){const r=(await db.query('select u.home_layout,h.home_layouts from users u join hospitals h on h.id=u.hospital_id where u.id=$1 and u.hospital_id=$2',[ctx.userId,ctx.hospitalId])).rows[0];const hosp=r?.home_layouts?.[ctx.role];const base=hosp?clean(ctx.role,hosp):roleDefault(ctx.role);const mine=r?.home_layout?clean(ctx.role,r.home_layout):null;return {layout:mine||base,source:mine?'user':hosp?'hospital':'role',catalog:allowed(ctx.role)}}
export async function saveLayout(db:Db,ctx:Ctx,b:any){if(b?.reset){await db.query('update users set home_layout=null where id=$1 and hospital_id=$2',[ctx.userId,ctx.hospitalId]);return getLayout(db,ctx)}const l=clean(ctx.role,b?.layout);await db.query('update users set home_layout=$3 where id=$1 and hospital_id=$2',[ctx.userId,ctx.hospitalId,JSON.stringify(l)]);return getLayout(db,ctx)}
export async function saveHospitalDefault(db:Db,ctx:Ctx,b:any){requireRole(ctx,['admin']);const role=String(b?.role||'') as Role;if(!ALL.includes(role))throw new HttpError(400,'Pick a role.');const l=b?.reset?null:clean(role,b?.layout);await db.query(`update hospitals set home_layouts=case when $2::jsonb is null then home_layouts-$3 else jsonb_set(home_layouts,array[$3],$2::jsonb) end where id=$1`,[ctx.hospitalId,l?JSON.stringify(l):null,role]);await audit(db,ctx,'home_default_layout','hospital',ctx.hospitalId,{role,widgets:l?.map(x=>x.id)||'reset'});return {ok:true,role,layout:l||roleDefault(role)}}
const n=async(db:Db,sql:string,p:any[])=>(await db.query(sql,p)).rows
/** Data for the requested widgets only; each query is hospital-scoped, doctor queues are the doctor's own. */
export async function widgetData(db:Db,ctx:Ctx,ids:string[]){const ok=new Set(allowed(ctx.role).map(w=>w.id));const want=ids.filter(i=>ok.has(i));const h=ctx.hospitalId,d=today(),mine=ctx.role==='doctor'?ctx.userId:null;const out:Record<string,any>={}
 await Promise.all(want.map(async id=>{switch(id){
  case 'kpi_patients':out[id]=(await n(db,"select (select count(*)::int from patients where hospital_id=$1 and (created_at at time zone 'Asia/Kolkata')::date=$2::date) registered,(select count(*)::int from doctor_queue where hospital_id=$1 and visit_date=$2 and ($3::uuid is null or doctor_user_id=$3)) seen",[h,d,mine]))[0];break
  case 'opd_queue':out[id]=await n(db,"select q.id,q.token_no,q.status,p.full_name,u.full_name doctor from doctor_queue q join patients p on p.id=q.patient_id join users u on u.id=q.doctor_user_id where q.hospital_id=$1 and q.visit_date=$2 and q.status in ('waiting','called','in_consultation') and ($3::uuid is null or q.doctor_user_id=$3) order by q.token_no limit 8",[h,d,mine]).catch(()=>[]);break
  case 'appointments':out[id]=await n(db,"select a.id,a.scheduled_at,a.status,coalesce(a.mode,'in_person') mode,a.meet_url,p.full_name,u.full_name doctor from appointments a join patients p on p.id=a.patient_id left join users u on u.id=a.doctor_user_id where a.hospital_id=$1 and a.scheduled_at>=now()-interval '1 hour' and (a.scheduled_at at time zone 'Asia/Kolkata')::date=$2::date and a.status<>'cancelled' and ($3::uuid is null or a.doctor_user_id=$3) order by a.scheduled_at limit 8",[h,d,mine]);break
  case 'doctor_availability':out[id]=(await doctorStatuses(db,h)).map((x:any)=>({name:x.full_name,status:x.status,online:x.online}));break
  case 'beds':out[id]=(await n(db,"select (select count(*)::int from beds where hospital_id=$1 and active) total,(select count(*)::int from admissions where hospital_id=$1 and status='admitted') occupied",[h]))[0];break
  case 'collections':out[id]=(await n(db,"select coalesce(sum(amount),0)::float total,count(*)::int n from (select amount from payments where hospital_id=$1 and (received_at at time zone 'Asia/Kolkata')::date=$2::date union all select amount from desk_receipts where hospital_id=$1 and (received_at at time zone 'Asia/Kolkata')::date=$2::date) t",[h,d]))[0];break
  case 'unpaid':out[id]=(await n(db,"select count(*)::int n from invoices where hospital_id=$1 and status in ('open','partially_paid')",[h]))[0];break
  case 'pending_labs':out[id]=(await n(db,"select count(*) filter(where status='ordered')::int ordered,count(*) filter(where status='sample_collected')::int collected from diagnostic_orders where hospital_id=$1 and status in ('ordered','sample_collected')",[h]))[0];break
  case 'low_stock':out[id]=await n(db,"select m.name,coalesce(sum(b.quantity),0)::int qty,m.reorder_level from medicines m left join medicine_batches b on b.medicine_id=m.id and b.expiry_date>current_date where m.hospital_id=$1 and m.active group by m.id having coalesce(sum(b.quantity),0)<=m.reorder_level order by 2 limit 8",[h]);break
  case 'expiring':out[id]=(await n(db,"select count(*)::int n from medicine_batches where hospital_id=$1 and quantity>0 and expiry_date between current_date and current_date+60",[h]))[0];break
  case 'reminders':out[id]=await n(db,"select f.id,f.follow_up_date,f.status,p.full_name from followup_offers f join patients p on p.id=f.patient_id where f.hospital_id=$1 and f.status='proposed' and ($2::uuid is null or f.doctor_user_id=$2) order by f.follow_up_date limit 6",[h,mine]);break
  case 'quick_actions':out[id]={role:ctx.role};break}}));return out}
/** Aqua Dynamics live-activity pill: tiny, role-aware snapshot (doctors see their own queue). */
export async function liveActivity(db:Db,ctx:Ctx){const h=ctx.hospitalId,d=today(),mine=ctx.role==='doctor'?ctx.userId:null
 const q=(await n(db,"select count(*) filter(where status='waiting')::int waiting,min(token_no) filter(where status='waiting')::int next_token,max(token_no) filter(where status in ('called','in_consultation'))::int serving,count(*) filter(where status='in_consultation')::int in_consult from doctor_queue where hospital_id=$1 and visit_date=$2 and ($3::uuid is null or doctor_user_id=$3)",[h,d,mine]).catch(()=>[{}]))[0]||{}
 const lab=(await n(db,"select count(*)::int pending from diagnostic_orders where hospital_id=$1 and status in ('ordered','sample_collected')",[h]).catch(()=>[{pending:0}]))[0]
 const appt=(await n(db,"select (a.scheduled_at at time zone 'Asia/Kolkata')::time::text t,p.full_name from appointments a join patients p on p.id=a.patient_id where a.hospital_id=$1 and a.scheduled_at>=now() and a.status<>'cancelled' and ($2::uuid is null or a.doctor_user_id=$2) order by a.scheduled_at limit 1",[h,mine]).catch(()=>[]))[0]||null
 return {waiting:q.waiting||0,nextToken:q.next_token??null,serving:q.serving??null,inConsult:q.in_consult||0,pendingLabs:lab?.pending||0,nextAppointment:appt?{time:String(appt.t).slice(0,5),name:appt.full_name}:null,at:new Date().toISOString()}}
