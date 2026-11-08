/** Staff duty roster: weekly shifts and leave for every staff role (doctors use the same tables as their OPD hours),
 *  and who is in the hospital right now. Later: attendance (punch in/out) will be compared against this roster. */
import {Ctx,Db,HttpError,audit,opt} from './core'
import {istDate,istToUtc,saveWeek,addLeave,deleteLeave} from './doctorsched'
export const STAFF_ROLES=['doctor','nurse','reception','lab','pharmacy','billing','admin'] as const
export const LEAVE_TYPES=['leave','casual','sick','earned','comp_off','training','holiday'] as const
export const SHIFTS:Record<string,[string,string]>={Morning:['08:00','14:00'],Evening:['14:00','20:00'],Night:['20:00','08:00'],General:['09:00','17:00']}
const IST=330*60000
const hm=(s:string)=>{const m=String(s||'').match(/^(\d{1,2}):(\d{2})/);if(!m||+m[1]>23||+m[2]>59)throw new HttpError(400,'Bad time '+s);return +m[1]*60+ +m[2]}
const fmt=(m:number)=>`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
const addDays=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400e3).toISOString().slice(0,10)
const dow=(d:string)=>new Date(d+'T00:00:00Z').getUTCDay()
export type Shift={day:number;start:string;end:string;shift?:string|null;slotMinutes?:number}
const label=(s:Shift)=>(s.shift?s.shift+' ':'')+s.start+'–'+s.end+(hm(s.end)<=hm(s.start)?' (+1)':'')

/** Every shift occurrence overlapping [from,to): absolute times, overnight shifts spilling into the next day. */
function occurrences(shifts:Shift[],fromIST:string,days:number){const out:{start:Date;end:Date;s:Shift}[]=[];for(let i=-1;i<days;i++){const d=addDays(fromIST,i);for(const s of shifts){if(s.day!==dow(d))continue;const a=hm(s.start),b=hm(s.end);out.push({start:istToUtc(d,a),end:istToUtc(d,b<=a?b+1440:b),s})}}return out}

/** Roster for the hospital: each staff member's week, leave and status now (on duty / on leave / off duty / no roster). */
export async function roster(db:Db,ctx:Ctx,o:{role?:string;now?:Date}={}){if(ctx.role==='patient')throw new HttpError(403,'Forbidden');const now=o.now||new Date();const role=opt(o.role);if(role&&!STAFF_ROLES.includes(role as any))throw new HttpError(400,'Unknown role.')
 const today=istDate(now),weekStart=addDays(today,-((dow(today)+6)%7))
 const staff=(await db.query("select id,full_name,role,department,photo_url,online from users where hospital_id=$1 and active and role<>'patient' and ($2::text is null or role::text=$2) order by array_position(array['doctor','nurse','reception','lab','pharmacy','billing','admin']::text[],role::text),full_name",[ctx.hospitalId,role])).rows
 const ids=staff.map((s:any)=>s.id);if(!ids.length)return {staff:[],today,weekStart,counts:await counts(db,ctx.hospitalId),canEdit:ctx.role==='admin',me:ctx.userId,shifts:SHIFTS,leaveTypes:LEAVE_TYPES}
 const av=(await db.query("select doctor_user_id uid,day_of_week \"day\",to_char(start_time,'HH24:MI') start,to_char(end_time,'HH24:MI') \"end\",shift_name shift,slot_minutes \"slotMinutes\" from doctor_availability where hospital_id=$1 and active and doctor_user_id=any($2) order by day_of_week,start_time",[ctx.hospitalId,ids])).rows
 const lv=(await db.query("select id,doctor_user_id uid,start_at,end_at,reason,leave_type from doctor_time_off where hospital_id=$1 and doctor_user_id=any($2) and end_at>$3 and start_at<$4 order by start_at",[ctx.hospitalId,ids,istToUtc(weekStart,0),istToUtc(addDays(weekStart,35),0)])).rows
 const by=(rows:any[])=>{const m=new Map<string,any[]>();for(const r of rows){const a=m.get(r.uid)||[];a.push(r);m.set(r.uid,a)}return m};const avBy=by(av),lvBy=by(lv)
 const out=staff.map((u:any)=>{const shifts:Shift[]=(avBy.get(u.id)||[]).map(({uid,...s}:any)=>s);const leaves=(lvBy.get(u.id)||[]).map(({uid,...l}:any)=>l)
  const leaveNow=leaves.find((l:any)=>new Date(l.start_at)<=now&&new Date(l.end_at)>now)
  const occ=occurrences(shifts,today,8).filter(x=>x.end>now&&!leaves.some((l:any)=>new Date(l.start_at)<x.end&&new Date(l.end_at)>x.start)).sort((a,b)=>+a.start-+b.start)
  const cur=occ.find(x=>x.start<=now),next=occ.find(x=>x.start>now)
  const status=leaveNow?'on_leave':cur?'on_duty':shifts.length?'off_duty':'no_roster'
  return {...u,status,leave:leaveNow?{type:leaveNow.leave_type,reason:leaveNow.reason,until:leaveNow.end_at}:null,shiftNow:cur?{label:label(cur.s),ends:cur.end}:null,next:next?{label:label(next.s),at:next.start}:null,
   today:shifts.filter(s=>s.day===dow(today)).map(label),shifts,leaves}})
 return {staff:out,today,weekStart,counts:await counts(db,ctx.hospitalId),canEdit:ctx.role==='admin',me:ctx.userId,shifts:SHIFTS,leaveTypes:LEAVE_TYPES}}
async function counts(db:Db,hid:string){const r=(await db.query("select role::text role,count(*)::int n from users where hospital_id=$1 and active and role<>'patient' group by role",[hid])).rows;return Object.fromEntries(r.map((x:any)=>[x.role,x.n]))}

async function staffMember(db:Db,ctx:Ctx,userId:string){const u=(await db.query("select id,role,full_name from users where id=$1 and hospital_id=$2 and role<>'patient'",[userId,ctx.hospitalId])).rows[0];if(!u)throw new HttpError(404,'Staff member not found.');return u}
/** Admin sets anyone's week; a doctor can still set their own OPD hours. */
function canEdit(ctx:Ctx,u:any){if(ctx.role==='admin')return;if(u.role==='doctor'&&ctx.role==='doctor'&&ctx.userId===u.id)return;throw new HttpError(403,'Only an admin can change the duty roster.')}

export async function saveShifts(db:Db,ctx:Ctx,userId:string,shifts:Shift[]){const u=await staffMember(db,ctx,userId);canEdit(ctx,u);if(!Array.isArray(shifts)||shifts.length>70)throw new HttpError(400,'Invalid shifts.')
 const names=shifts.map(s=>opt(s.shift)?.slice(0,30)||null)
 if(u.role==='doctor'){await saveWeek(db,ctx,u.id,shifts.map(s=>({day:s.day,start:s.start,end:s.end,slotMinutes:Number(s.slotMinutes||15)})))}
 else{const clean=shifts.map((s,i)=>{const d=Number(s.day),a=hm(s.start),b=hm(s.end);if(!(d>=0&&d<=6))throw new HttpError(400,'Invalid day.');if(a===b)throw new HttpError(400,'Shift start and end are the same.');return {d,a,b:b<a?b+1440:b,name:names[i]}})
  // overlaps, including an overnight shift running into the next day's first shift
  const abs=clean.map(c=>({...c,s:c.d*1440+c.a,e:c.d*1440+c.b}));for(let i=0;i<abs.length;i++)for(let j=0;j<abs.length;j++){if(i===j)continue;const x=abs[i],y=abs[j];for(const off of [0,7*1440,-7*1440]){if(x.s<y.e+off&&y.s+off<x.e&&(i<j||off!==0))throw new HttpError(400,'Two shifts overlap.')}}
  await db.query('delete from doctor_availability where hospital_id=$1 and doctor_user_id=$2',[ctx.hospitalId,u.id])
  for(const c of clean)await db.query('insert into doctor_availability(hospital_id,doctor_user_id,day_of_week,start_time,end_time,slot_minutes,active,shift_name) values($1,$2,$3,$4,$5,30,true,$6)',[ctx.hospitalId,u.id,c.d,fmt(c.a),fmt(c.b%1440),c.name])
  await audit(db,ctx,'roster_update','user',u.id,{shifts:clean.length})}
 if(u.role==='doctor')for(let i=0;i<shifts.length;i++)if(names[i])await db.query('update doctor_availability set shift_name=$4 where hospital_id=$1 and doctor_user_id=$2 and day_of_week=$3 and start_time=$5',[ctx.hospitalId,u.id,Number(shifts[i].day),names[i],shifts[i].start])
 return {ok:true}}

export async function addStaffLeave(db:Db,ctx:Ctx,userId:string,b:any){const u=await staffMember(db,ctx,userId);canEdit(ctx,u);const type=opt(b.leaveType)||'leave';if(!LEAVE_TYPES.includes(type as any))throw new HttpError(400,'Unknown leave type.')
 if(u.role==='doctor'){const r=await addLeave(db,ctx,u.id,{startDate:b.startDate,endDate:b.endDate,reason:opt(b.reason)||type.replace('_',' ')});await db.query('update doctor_time_off set leave_type=$2 where id=$1',[r.id,type]);return r}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(b.startDate||''))throw new HttpError(400,'Pick a start date.');const end=/^\d{4}-\d{2}-\d{2}$/.test(b.endDate||'')?b.endDate:b.startDate;if(end<b.startDate)throw new HttpError(400,'End date is before start date.')
 const r=(await db.query('insert into doctor_time_off(hospital_id,doctor_user_id,start_at,end_at,reason,leave_type,created_by) values($1,$2,$3,$4,$5,$6,$7) returning id',[ctx.hospitalId,u.id,istToUtc(b.startDate,0),istToUtc(end,1440),String(opt(b.reason)||type.replace('_',' ')).slice(0,120),type,ctx.userId])).rows[0]
 await audit(db,ctx,'leave_add','user',u.id,{from:b.startDate,to:end,type});return {id:r.id,affectedAppointments:0}}
export async function deleteStaffLeave(db:Db,ctx:Ctx,leaveId:string){const l=(await db.query('select doctor_user_id uid from doctor_time_off where id=$1 and hospital_id=$2',[leaveId,ctx.hospitalId])).rows[0];if(!l)throw new HttpError(404,'Leave not found.');const u=await staffMember(db,ctx,l.uid);canEdit(ctx,u)
 if(u.role==='doctor')return deleteLeave(db,ctx,leaveId);await db.query('delete from doctor_time_off where id=$1 and hospital_id=$2',[leaveId,ctx.hospitalId]);await audit(db,ctx,'leave_delete','user',u.id);return {ok:true}}

/** Staff board (admin): per role, rostered today vs on duty vs logged in, and the gaps between roster and system use. */
export async function staffBoard(db:Db,ctx:Ctx,now=new Date()){if(ctx.role!=='admin')throw new HttpError(403,'Only an admin can see the staff board.');const r=await roster(db,ctx,{now})
 const dayStart=istToUtc(r.today,0),activeSince=new Date(now.getTime()-15*60000)
 const seen=new Map((await db.query("select id,last_login_at,last_seen_at from users where hospital_id=$1 and active and role<>'patient'",[ctx.hospitalId])).rows.map((x:any)=>[x.id,x]))
 const rows=r.staff.map((s:any)=>{const v:any=seen.get(s.id)||{};const last=[v.last_login_at,v.last_seen_at].filter(Boolean).map((d:any)=>new Date(d)).sort((a,b)=>+b-+a)[0]||null
  return {id:s.id,full_name:s.full_name,role:s.role,department:s.department,status:s.status,shiftNow:s.shiftNow,rosteredToday:s.today.length>0&&s.status!=='on_leave',loggedInToday:!!last&&last>=dayStart,activeNow:!!v.last_seen_at&&new Date(v.last_seen_at)>=activeSince,lastSeen:last}})
 const roles=[...new Set(rows.map((x:any)=>x.role))].map(role=>{const g=rows.filter((x:any)=>x.role===role);const n=(f:(x:any)=>boolean)=>g.filter(f).length
  return {role,staff:g.length,rosteredToday:n(x=>x.rosteredToday),onDuty:n(x=>x.status==='on_duty'),onLeave:n(x=>x.status==='on_leave'),loggedInToday:n(x=>x.loggedInToday),activeNow:n(x=>x.activeNow)}})
 const sum=(k:string)=>roles.reduce((a:number,x:any)=>a+x[k],0)
 return {today:r.today,roles,total:{staff:rows.length,rosteredToday:sum('rosteredToday'),onDuty:sum('onDuty'),onLeave:sum('onLeave'),loggedInToday:sum('loggedInToday'),activeNow:sum('activeNow')},
  onDutyNotLoggedIn:rows.filter((x:any)=>x.status==='on_duty'&&!x.loggedInToday),workingOffRoster:rows.filter((x:any)=>x.activeNow&&x.status!=='on_duty'),onLeaveButActive:rows.filter((x:any)=>x.status==='on_leave'&&x.loggedInToday)}}
