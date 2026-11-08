/** Operation theatre: OT rooms, the day board, scheduling with clash checks (room, team on leave or in another case, patient),
 *  the WHO Surgical Safety Checklist gates (sign in + time out before start; sign out + operative note before completion),
 *  and the procedure charge, which shows in billing's pending charges once the surgery is completed. All times IST. */
import {Ctx,Db,HttpError,assertPatient,audit,num,opt,required,requireRole} from './core';import {istDate,istToUtc,leaves} from './doctorsched'
import {Phase,PHASES,WHO,clean,missing} from '../otChecklist'
const TEAM=['admin','doctor','nurse'] as const
const ANAES=['general','spinal','epidural','regional','local','sedation','none']
const PH=PHASES.map(p=>p.id)
const hm=(s:string)=>{const m=String(s||'').match(/^([01]?\d|2[0-3]):([0-5]\d)$/);if(!m)throw new HttpError(400,'Pick a start time (HH:MM).');return +m[1]*60+ +m[2]}
const ymd=(s:unknown)=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))
const tl=(d:Date)=>new Date(d.getTime()+330*60000).toISOString().slice(11,16)

export async function listRooms(db:Db,ctx:Ctx,all=false){requireRole(ctx,[...TEAM,'reception','billing']);return (await db.query('select id,name,active from ot_rooms where hospital_id=$1 and ($2 or active) order by name',[ctx.hospitalId,all])).rows}
export async function addRoom(db:Db,ctx:Ctx,b:any){requireRole(ctx,['admin']);const name=required(b.name,'Room name').slice(0,60)
 const r=(await db.query('insert into ot_rooms(hospital_id,name) values($1,$2) on conflict(hospital_id,name) do nothing returning id,name,active',[ctx.hospitalId,name])).rows[0];if(!r)throw new HttpError(409,'An OT room with that name already exists.')
 await audit(db,ctx,'ot.room_add','ot_room',r.id,{name});return r}
export async function setRoomActive(db:Db,ctx:Ctx,id:string,active:boolean){requireRole(ctx,['admin']);const r=(await db.query('update ot_rooms set active=$3 where id=$1 and hospital_id=$2 returning id,name,active',[id,ctx.hospitalId,!!active])).rows[0];if(!r)throw new HttpError(404,'OT room not found.');await audit(db,ctx,active?'ot.room_on':'ot.room_off','ot_room',id);return r}

async function staff(db:Db,ctx:Ctx,id:unknown,label:string,roles:string[]){const r=(await db.query('select id,full_name,role::text role from users where id=$1 and hospital_id=$2 and active and role::text=any($3)',[required(id,label),ctx.hospitalId,roles])).rows[0];if(!r)throw new HttpError(404,label+' not found.');return r}
async function load(db:Db,ctx:Ctx,id:string){const s=(await db.query('select * from surgeries where id=$1 and hospital_id=$2',[required(id,'Surgery'),ctx.hospitalId])).rows[0];if(!s)throw new HttpError(404,'Surgery not found.');return s}

/** Reasons a slot cannot be booked (empty = free). Cancelled cases never block; `except` skips the case being moved. */
export async function clashes(db:Db,hid:string,x:{roomId:string;patientId:string;team:{id:string;full_name:string}[];start:Date;end:Date;except?:string|null}){const out:string[]=[]
 const q=(w:string,p:unknown[])=>db.query(`select s.id,s.procedure_name,s.scheduled_start,s.scheduled_end,r.name room from surgeries s join ot_rooms r on r.id=s.room_id where s.hospital_id=$1 and s.status<>'cancelled' and s.scheduled_start<$3 and s.scheduled_end>$2 and ($4::uuid is null or s.id<>$4) and ${w} order by s.scheduled_start limit 1`,[hid,x.start,x.end,x.except||null,...p]).then(r=>r.rows[0])
 const span=(c:any)=>tl(new Date(c.scheduled_start))+'–'+tl(new Date(c.scheduled_end))
 const room=await q('s.room_id=$5',[x.roomId]);if(room)out.push(`${room.room} is booked ${span(room)} (${room.procedure_name}).`)
 const pt=await q('s.patient_id=$5',[x.patientId]);if(pt)out.push(`The patient already has ${pt.procedure_name} at ${span(pt)}.`)
 for(const m of x.team){const lv=await leaves(db,hid,m.id,x.start,x.end);if(lv.length)out.push(`${m.full_name} is on leave${lv[0].reason?' ('+lv[0].reason+')':''} at that time.`)
  const busy=await q('(s.surgeon_id=$5 or s.anaesthetist_id=$5 or $5=any(s.assistant_ids))',[m.id]);if(busy)out.push(`${m.full_name} is in another case ${span(busy)} (${busy.procedure_name}, ${busy.room}).`)}
 return out}

/** Validate a schedule request into the row values (time, room, team, service, admission). */
async function plan(db:Db,ctx:Ctx,b:any,cur?:any){const patient=cur?{id:cur.patient_id}:await assertPatient(db,ctx,b.patientId)
 const room=(await db.query('select id,name from ot_rooms where id=$1 and hospital_id=$2 and active',[required(b.roomId??cur?.room_id,'OT room'),ctx.hospitalId])).rows[0];if(!room)throw new HttpError(404,'OT room not found.')
 const surgeon=await staff(db,ctx,b.surgeonId??cur?.surgeon_id,'Surgeon',['doctor'])
 const anId=b.anaesthetistId!==undefined?opt(b.anaesthetistId):cur?.anaesthetist_id||null;const an=anId?await staff(db,ctx,anId,'Anaesthetist',['doctor']):null
 const aIds:string[]=[...new Set<string>((Array.isArray(b.assistantIds)?b.assistantIds:b.assistantIds!=null?String(b.assistantIds).split(','):cur?.assistant_ids||[]).map((s:any)=>String(s).trim()).filter(Boolean))]
 if(aIds.length>6)throw new HttpError(400,'At most 6 assistants.');const assistants=[];for(const a of aIds)assistants.push(await staff(db,ctx,a,'Assistant',['doctor','nurse']))
 const team=[surgeon,...(an?[an]:[]),...assistants];if(new Set(team.map(t=>t.id)).size<team.length)throw new HttpError(400,'The same person is picked twice in the team.')
 let start:Date,end:Date
 if(b.startAt){start=new Date(b.startAt);if(isNaN(start.getTime()))throw new HttpError(400,'Invalid start time.')}else if(b.date||b.startTime){const cs=cur?new Date(cur.scheduled_start):null;const d=b.date||(cs&&istDate(cs));if(!ymd(d))throw new HttpError(400,'Pick a date.');start=istToUtc(d,hm(b.startTime||(cs?tl(cs):'')))}else if(cur)start=new Date(cur.scheduled_start);else throw new HttpError(400,'Pick a date and start time.')
 if(b.endAt){end=new Date(b.endAt);if(isNaN(end.getTime()))throw new HttpError(400,'Invalid end time.')}else{const d=b.durationMin!=null&&b.durationMin!==''?num(b.durationMin,'Duration',{min:10})!:cur?(new Date(cur.scheduled_end).getTime()-new Date(cur.scheduled_start).getTime())/60000:60;end=new Date(start.getTime()+d*60000)}
 if(end<=start)throw new HttpError(400,'The end time must be after the start.');if(end.getTime()-start.getTime()>24*3600e3)throw new HttpError(400,'A case cannot be longer than 24 hours.')
 if(!cur&&start.getTime()<Date.now()-15*60000)throw new HttpError(400,'Pick a time in the future.')
 let serviceId=b.serviceId!==undefined?opt(b.serviceId):cur?.service_id||null;let svc:any=null
 if(serviceId){svc=(await db.query("select id,name,price from service_catalog where id=$1 and hospital_id=$2 and category='procedure' and active",[serviceId,ctx.hospitalId])).rows[0];if(!svc)throw new HttpError(404,'Procedure service not found (pick one from the procedure list).')}
 const procedure=opt(b.procedureName)||cur?.procedure_name||svc?.name;if(!procedure)throw new HttpError(400,'Procedure is required.')
 const anaes=b.anaesthesiaType!==undefined?opt(b.anaesthesiaType):cur?.anaesthesia_type||null;if(anaes&&!ANAES.includes(anaes))throw new HttpError(400,'Invalid anaesthesia type.')
 const priority=opt(b.priority)||cur?.priority||'elective';if(!['elective','emergency'].includes(priority))throw new HttpError(400,'Priority is elective or emergency.')
 let admissionId=cur?cur.admission_id:opt(b.admissionId)
 if(admissionId){const a=(await db.query('select id from admissions where id=$1 and hospital_id=$2 and patient_id=$3',[admissionId,ctx.hospitalId,patient.id])).rows[0];if(!a)throw new HttpError(404,'Admission not found for this patient.')}
 else if(!cur)admissionId=(await db.query("select id from admissions where hospital_id=$1 and patient_id=$2 and status='admitted' order by admitted_at desc limit 1",[ctx.hospitalId,patient.id])).rows[0]?.id||null
 const bad=await clashes(db,ctx.hospitalId,{roomId:room.id,patientId:patient.id,team,start,end,except:cur?.id});if(bad.length)throw new HttpError(409,bad.join(' '),{code:'ot_clash',clashes:bad})
 return {patientId:patient.id,admissionId,roomId:room.id,surgeonId:surgeon.id,assistantIds:assistants.map(a=>a.id),anaesthetistId:an?.id||null,procedure:procedure.slice(0,200),serviceId:svc?.id||null,start,end,anaes,priority,remarks:b.remarks!==undefined?opt(b.remarks):cur?.remarks||null}}

export async function scheduleSurgery(db:Db,ctx:Ctx,b:any){requireRole(ctx,['admin','doctor']);const p=await plan(db,ctx,b)
 const s=(await db.query('insert into surgeries(hospital_id,patient_id,admission_id,room_id,surgeon_id,assistant_ids,anaesthetist_id,procedure_name,service_id,scheduled_start,scheduled_end,anaesthesia_type,priority,remarks,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *',[ctx.hospitalId,p.patientId,p.admissionId,p.roomId,p.surgeonId,p.assistantIds,p.anaesthetistId,p.procedure,p.serviceId,p.start,p.end,p.anaes,p.priority,p.remarks,ctx.userId])).rows[0]
 await audit(db,ctx,'ot.schedule','surgery',s.id,{procedure:p.procedure,room:p.roomId,start:p.start.toISOString(),end:p.end.toISOString(),priority:p.priority});return s}
/** Move or re-team a case that has not started. */
export async function updateSurgery(db:Db,ctx:Ctx,id:string,b:any){requireRole(ctx,['admin','doctor']);const cur=await load(db,ctx,id);if(cur.status!=='scheduled')throw new HttpError(409,'Only a scheduled case can be changed.');const p=await plan(db,ctx,b,cur)
 const s=(await db.query('update surgeries set room_id=$3,surgeon_id=$4,assistant_ids=$5,anaesthetist_id=$6,procedure_name=$7,service_id=$8,scheduled_start=$9,scheduled_end=$10,anaesthesia_type=$11,priority=$12,remarks=$13 where id=$1 and hospital_id=$2 returning *',[id,ctx.hospitalId,p.roomId,p.surgeonId,p.assistantIds,p.anaesthetistId,p.procedure,p.serviceId,p.start,p.end,p.anaes,p.priority,p.remarks])).rows[0]
 await audit(db,ctx,'ot.update','surgery',id,{room:p.roomId,start:p.start.toISOString(),end:p.end.toISOString()});return s}
export async function cancelSurgery(db:Db,ctx:Ctx,id:string,b:any){requireRole(ctx,['admin','doctor']);const cur=await load(db,ctx,id);if(cur.status!=='scheduled')throw new HttpError(409,cur.status==='in_progress'?'The surgery has started; complete it instead.':'This case is already '+cur.status.replace('_',' ')+'.');const reason=required(b?.reason,'Reason').slice(0,300)
 const s=(await db.query("update surgeries set status='cancelled',cancelled_at=now(),cancel_reason=$3 where id=$1 and hospital_id=$2 and status='scheduled' returning *",[id,ctx.hospitalId,reason])).rows[0];if(!s)throw new HttpError(409,'The case changed. Reload.');await audit(db,ctx,'ot.cancel','surgery',id,{reason});return s}

/** Save answers for one checklist phase. Phases go in order; a phase is signed (by/at) once every item is answered, then locked. */
export async function saveChecklist(db:Db,ctx:Ctx,id:string,phase:string,answers:any){requireRole(ctx,[...TEAM]);if(!PH.includes(phase as Phase))throw new HttpError(400,'Unknown checklist phase.');const ph=phase as Phase;const s=await load(db,ctx,id)
 if(s.status==='cancelled'||s.status==='completed')throw new HttpError(409,'This case is '+s.status+'.')
 if(s[ph+'_at'])throw new HttpError(409,PHASES.find(p=>p.id===ph)!.label+' is already signed.')
 if(ph==='time_out'&&!s.sign_in_at)throw new HttpError(409,'Complete sign in first.')
 if(ph==='sign_out'&&s.status!=='in_progress')throw new HttpError(409,'Sign out is done at the end of the surgery, after it has started.')
 if(ph!=='sign_out'&&s.status!=='scheduled')throw new HttpError(409,'The surgery has already started.')
 const a=clean(ph,answers),left=missing(ph,a),done=!left.length
 await db.query(`update surgeries set ${ph}=$3,${ph}_by=case when $4 then $5::uuid end,${ph}_at=case when $4 then now() end where id=$1 and hospital_id=$2`,[id,ctx.hospitalId,JSON.stringify(a),done,ctx.userId])
 await audit(db,ctx,done?'ot.checklist_signed':'ot.checklist_saved','surgery',id,{phase:ph,answered:WHO[ph].length-left.length,of:WHO[ph].length});return {phase:ph,complete:done,missing:left.map(i=>i.text)}}

export async function startSurgery(db:Db,ctx:Ctx,id:string){requireRole(ctx,[...TEAM]);const s=await load(db,ctx,id);if(s.status!=='scheduled')throw new HttpError(409,'This case is '+s.status.replace('_',' ')+'.')
 const need=[!s.sign_in_at&&'sign in',!s.time_out_at&&'time out'].filter(Boolean);if(need.length)throw new HttpError(409,'Complete the WHO checklist '+need.join(' and ')+' before starting.',{code:'checklist_pending',missing:need})
 const busy=(await db.query("select r.name from surgeries x join ot_rooms r on r.id=x.room_id where x.hospital_id=$1 and x.room_id=$2 and x.status='in_progress' and x.id<>$3",[ctx.hospitalId,s.room_id,id])).rows[0];if(busy)throw new HttpError(409,busy.name+' still has a surgery in progress.')
 const r=(await db.query("update surgeries set status='in_progress',actual_start=now() where id=$1 and hospital_id=$2 and status='scheduled' returning *",[id,ctx.hospitalId])).rows[0];if(!r)throw new HttpError(409,'The case changed. Reload.');await audit(db,ctx,'ot.start','surgery',id);return r}

const NOTE:[string,string][]=[['preOpDiagnosis','pre_op_diagnosis'],['postOpDiagnosis','post_op_diagnosis'],['findings','findings'],['procedureDetails','procedure_details'],['complications','complications'],['postOpInstructions','post_op_instructions']]
const noteGaps=(s:any)=>[!String(s.post_op_diagnosis||'').trim()&&'post-op diagnosis',!String(s.procedure_details||'').trim()&&'procedure details'].filter(Boolean) as string[]
/** Operative note: diagnoses, findings, procedure, implants (name, size, lot/serial, qty), blood loss, complications, post-op orders. */
export async function saveOpNote(db:Db,ctx:Ctx,id:string,b:any){requireRole(ctx,['admin','doctor']);const s=await load(db,ctx,id);if(s.status==='cancelled')throw new HttpError(409,'This case is cancelled.');if(s.status==='completed')throw new HttpError(409,'The surgery is completed; the operative note is locked.')
 const v:Record<string,unknown>={};for(const [k,c] of NOTE)v[c]=b[k]!==undefined?(opt(b[k])?.slice(0,8000)??null):s[c]
 const loss=b.bloodLossMl!==undefined?num(b.bloodLossMl,'Blood loss'):s.blood_loss_ml;if(loss!=null&&loss>20000)throw new HttpError(400,'Blood loss looks wrong (ml).')
 let imp=s.implants||[];if(b.implants!==undefined){if(!Array.isArray(b.implants)||b.implants.length>30)throw new HttpError(400,'Implants must be a list.');imp=b.implants.map((x:any)=>({name:opt(x?.name)?.slice(0,120),size:opt(x?.size)?.slice(0,60)||null,lot:opt(x?.lot)?.slice(0,60)||null,qty:Math.max(1,Math.round(Number(x?.qty)||1))})).filter((x:any)=>x.name)}
 const r=(await db.query('update surgeries set pre_op_diagnosis=$3,post_op_diagnosis=$4,findings=$5,procedure_details=$6,complications=$7,post_op_instructions=$8,blood_loss_ml=$9,implants=$10,note_by=$11,note_at=now() where id=$1 and hospital_id=$2 returning *',[id,ctx.hospitalId,v.pre_op_diagnosis,v.post_op_diagnosis,v.findings,v.procedure_details,v.complications,v.post_op_instructions,loss==null?null:Math.round(loss),JSON.stringify(imp),ctx.userId])).rows[0]
 await audit(db,ctx,'ot.note','surgery',id,{implants:imp.length,complete:!noteGaps(r).length});return r}

export async function completeSurgery(db:Db,ctx:Ctx,id:string){requireRole(ctx,['admin','doctor']);const s=await load(db,ctx,id);if(s.status!=='in_progress')throw new HttpError(409,s.status==='scheduled'?'Start the surgery first.':'This case is '+s.status+'.')
 const need=[!s.sign_out_at&&'the WHO sign out',...noteGaps(s).map(g=>'the operative note ('+g+')')].filter(Boolean);if(need.length)throw new HttpError(409,'Complete '+need.join(' and ')+' before finishing.',{code:'completion_pending',missing:need})
 const r=(await db.query("update surgeries set status='completed',actual_end=now() where id=$1 and hospital_id=$2 and status='in_progress' returning *",[id,ctx.hospitalId])).rows[0];if(!r)throw new HttpError(409,'The case changed. Reload.')
 const charge=r.service_id?(await db.query('select name,price from service_catalog where id=$1',[r.service_id])).rows[0]:null
 await audit(db,ctx,'ot.complete','surgery',id,{charge:charge?Number(charge.price):null});return {...r,charge:charge?{description:charge.name,unitPrice:Number(charge.price)}:null}}

/** Completed surgeries with a procedure service and no bill line yet: billing's pending charges (source_type 'surgery'). */
export async function otCharges(db:Db,hid:string,patientId:string){return (await db.query("select s.id,s.procedure_name,s.actual_end,s.admission_id,c.id sid,c.name,c.price from surgeries s join service_catalog c on c.id=s.service_id where s.hospital_id=$1 and s.patient_id=$2 and s.status='completed' and not exists(select 1 from invoice_items i where i.source_type='surgery' and i.source_id=s.id) order by s.actual_end",[hid,patientId])).rows
 .map((r:any)=>({sourceType:'surgery',sourceId:r.id,serviceId:r.sid,admissionId:r.admission_id,description:`${r.name}${r.name!==r.procedure_name?' · '+r.procedure_name:''} · ${istDate(new Date(r.actual_end))}`,unitPrice:Number(r.price)}))}

const SEL=`select s.*,p.full_name patient,p.uhid,p.gender,p.date_of_birth,r.name room,u.full_name surgeon,an.full_name anaesthetist,c.name service_name,c.price service_price,a.admission_no,
 (select coalesce(array_agg(x.full_name order by x.full_name),'{}') from users x where x.id=any(s.assistant_ids)) assistants,
 si.full_name sign_in_name,tox.full_name time_out_name,so.full_name sign_out_name,nb.full_name note_name
 from surgeries s join patients p on p.id=s.patient_id join ot_rooms r on r.id=s.room_id join users u on u.id=s.surgeon_id left join users an on an.id=s.anaesthetist_id
 left join service_catalog c on c.id=s.service_id left join admissions a on a.id=s.admission_id
 left join users si on si.id=s.sign_in_by left join users tox on tox.id=s.time_out_by left join users so on so.id=s.sign_out_by left join users nb on nb.id=s.note_by`
const shape=(s:any)=>({...s,checklist:Object.fromEntries(PH.map(ph=>[ph,{answers:s[ph]||{},by:s[ph+'_name']||null,at:s[ph+'_at']||null,complete:!!s[ph+'_at'],missing:missing(ph,s[ph]).map(i=>i.key)}])),noteMissing:noteGaps(s)})

/** One day's board: rooms with their cases (IST date), plus the pick-lists for the schedule form. */
export async function otBoard(db:Db,ctx:Ctx,date?:string){requireRole(ctx,[...TEAM]);const d=ymd(date)?date!:istDate(new Date());const from=istToUtc(d,0),to=istToUtc(d,1440)
 const [rooms,cases,doctors,nurses,services]=await Promise.all([db.query('select id,name,active from ot_rooms where hospital_id=$1 order by name',[ctx.hospitalId]),
  db.query(SEL+' where s.hospital_id=$1 and s.scheduled_start<$3 and s.scheduled_end>$2 order by s.scheduled_start',[ctx.hospitalId,from,to]),
  db.query("select id,full_name,department from users where hospital_id=$1 and role::text='doctor' and active order by full_name",[ctx.hospitalId]),
  db.query("select id,full_name from users where hospital_id=$1 and role::text='nurse' and active order by full_name",[ctx.hospitalId]),
  db.query("select id,code,name,price from service_catalog where hospital_id=$1 and category='procedure' and active order by name",[ctx.hospitalId])])
 const list=cases.rows.map((s:any)=>{const x=shape(s);return {id:x.id,patient:x.patient,uhid:x.uhid,procedure_name:x.procedure_name,room_id:x.room_id,surgeon:x.surgeon,anaesthetist:x.anaesthetist,assistants:x.assistants,scheduled_start:x.scheduled_start,scheduled_end:x.scheduled_end,actual_start:x.actual_start,actual_end:x.actual_end,status:x.status,priority:x.priority,anaesthesia_type:x.anaesthesia_type,checks:PH.filter(p=>x.checklist[p].complete).length}})
 return {date:d,rooms:rooms.rows.filter((r:any)=>r.active||list.some((c:any)=>c.room_id===r.id)),allRooms:rooms.rows,surgeries:list,doctors:doctors.rows,nurses:nurses.rows,services:services.rows,
  counts:{total:list.filter((c:any)=>c.status!=='cancelled').length,inProgress:list.filter((c:any)=>c.status==='in_progress').length,completed:list.filter((c:any)=>c.status==='completed').length,emergency:list.filter((c:any)=>c.priority==='emergency'&&c.status!=='cancelled').length}}}

/** Full case for the drawer and the printable operative note. */
export async function getSurgery(db:Db,ctx:Ctx,id:string){requireRole(ctx,[...TEAM,'billing']);const s=(await db.query(SEL+' where s.id=$1 and s.hospital_id=$2',[required(id,'Surgery'),ctx.hospitalId])).rows[0];if(!s)throw new HttpError(404,'Surgery not found.')
 const h=(await db.query('select name,address,contact_phone,contact_email,logo_url from hospitals where id=$1',[ctx.hospitalId])).rows[0]||{}
 return {surgery:shape(s),hospital:{name:h.name,address:h.address,phone:h.contact_phone,email:h.contact_email,logoUrl:h.logo_url}}}
