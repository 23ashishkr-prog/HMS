/** Emergency department: quick registration (unknown patients get a temporary name), colour triage with re-triage history,
 *  the live board, door-to-doctor time, medico-legal cases (MLC) with police intimation, and disposition (admit calls IPD admit). */
import {Ctx,Db,HttpError,audit,assertPatient,assertDoctor,nextCounter,num,opt,required,requireRole,uhidPrefix} from './core'
import {registerPatient,updatePatient} from './patients';import {admit} from './ipd';import {istDate} from './doctorsched'
const ER=['admin','reception','doctor','nurse'] as const
/** Indian ER colour triage, 5 levels matched to ESI. target = minutes to be seen by a doctor. */
export const TRIAGE={red:{rank:1,esi:1,label:'Red · Immediate (resuscitation)',target:0},orange:{rank:2,esi:2,label:'Orange · Very urgent',target:10},yellow:{rank:3,esi:3,label:'Yellow · Urgent',target:30},green:{rank:4,esi:4,label:'Green · Non-urgent',target:120},black:{rank:5,esi:5,label:'Black · Deceased / brought dead',target:null}} as const
export type TriageLevel=keyof typeof TRIAGE
export const ARRIVAL=['walk_in','ambulance_108','private_ambulance','police','referred','other'] as const
export const DISPOSITIONS=['admitted','discharged','referred','lama','absconded','death'] as const
export const MLC_TYPES:Record<string,string>={rta:'Road traffic accident',assault:'Assault',burns:'Burns',poisoning:'Poisoning',fall:'Fall from height',hanging:'Hanging',snake_bite:'Snake bite',sexual_assault:'Sexual assault',other:'Other'}
const VITALS:[string,string,number,number][]=[['bpSys','BP systolic',30,300],['bpDia','BP diastolic',10,200],['pulse','Pulse',0,250],['resp','Respiration',0,80],['spo2','SpO₂',0,100],['tempF','Temperature °F',80,110],['gcs','GCS',3,15],['pain','Pain (0–10)',0,10],['sugar','Blood sugar',10,900]]
const mins=(a:any,b:any)=>a&&b?Math.round((new Date(b).getTime()-new Date(a).getTime())/60000):null
const at=(v:unknown,name:string)=>{if(v==null||v==='')return null;const d=new Date(String(v));if(isNaN(d.getTime()))throw new HttpError(400,'Bad '+name+'.');if(d.getTime()>Date.now()+5*60000)throw new HttpError(400,name+' cannot be in the future.');return d}
function vitals(b:any){const out:any={};for(const [k,l,lo,hi] of VITALS){const v=num(b?.[k],l);if(v==null)continue;if(v<lo||v>hi)throw new HttpError(400,`${l} ${v} looks wrong (expected ${lo}–${hi}).`);out[k]=v}const avpu=opt(b?.avpu);if(avpu){if(!['A','V','P','U'].includes(avpu.toUpperCase()))throw new HttpError(400,'AVPU must be A, V, P or U.');out.avpu=avpu.toUpperCase()}return out}
const level=(v:unknown):TriageLevel=>{const s=String(v||'').toLowerCase().trim();if(!(s in TRIAGE))throw new HttpError(400,'Choose a triage colour: red, orange, yellow, green or black.');return s as TriageLevel}
async function visit(db:Db,ctx:Ctx,id:string,needOpen=true){const v=(await db.query('select * from er_visits where id=$1 and hospital_id=$2',[id,ctx.hospitalId])).rows[0];if(!v)throw new HttpError(404,'ER visit not found.');if(needOpen&&v.disposition)throw new HttpError(409,'This ER visit is already closed ('+v.disposition+').');return v}

/** Quick registration. Existing patient by id; a known new patient by name; or an unknown patient with a temporary name ("Unknown Male ~40"). */
export async function registerVisit(db:Db,ctx:Ctx,b:any){requireRole(ctx,[...ER]);const desk={...ctx,role:'reception' as const}
 let p:any,unknown=false,temp:string|null=null
 if(b.patientId)p=await assertPatient(db,ctx,b.patientId)
 else if(b.unknown===true||b.unknown==='true'||b.unknown==='on'){unknown=true;const g=['Male','Female','Other'].includes(b.gender)?b.gender:null;const age=num(b.approxAge,'Approximate age');temp=opt(b.tempName)||`Unknown ${g||'Person'}${age!=null?' ~'+age:''}`;p=await registerPatient(db,desk,{fullName:temp,gender:g,confirmNotDuplicate:true})}
 else p=await registerPatient(db,desk,{fullName:required(b.fullName,'Patient name (or tick Unknown)'),mobile:b.mobile,gender:b.gender,dateOfBirth:b.dateOfBirth,confirmNotDuplicate:b.confirmNotDuplicate})
 const open=(await db.query('select visit_no from er_visits where patient_id=$1 and hospital_id=$2 and disposition is null',[p.id,ctx.hospitalId])).rows[0];if(open)throw new HttpError(409,'This patient is already on the ER board ('+open.visit_no+').')
 const mode=opt(b.arrivalMode)||'walk_in';if(!(ARRIVAL as readonly string[]).includes(mode))throw new HttpError(400,'Unknown arrival mode.')
 const arrived=at(b.arrivedAt,'Arrival time')||new Date();const y=istDate(arrived).slice(0,4)
 const no=`${await uhidPrefix(db,ctx.hospitalId)}/ER/${y}/${String(await nextCounter(db,ctx.hospitalId,'er_visit',y)).padStart(5,'0')}`
 const doc=b.doctorId?(await assertDoctor(db,ctx,b.doctorId)).id:null
 const v=(await db.query('insert into er_visits(hospital_id,visit_no,patient_id,unknown_patient,temp_name,approx_age,gender,arrival_mode,arrived_at,brought_by,referred_from,chief_complaint,doctor_id,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *',[ctx.hospitalId,no,p.id,unknown,temp,num(b.approxAge,'Approximate age'),opt(b.gender),mode,arrived,opt(b.broughtBy),opt(b.referredFrom),opt(b.chiefComplaint),doc,ctx.userId])).rows[0]
 await audit(db,ctx,'er_register','er_visit',v.id,{visitNo:no,unknown,arrivalMode:mode})
 if(b.triageLevel&&ctx.role!=='reception')return {...await triage(db,ctx,v.id,{...b.vitals,...b,level:b.triageLevel}),patient:p}
 return {...v,patient:p}}

/** Triage or re-triage. Every triage is kept in er_triages; the visit shows the latest colour. */
export async function triage(db:Db,ctx:Ctx,visitId:string,b:any){requireRole(ctx,['admin','doctor','nurse']);const v=await visit(db,ctx,visitId);const lv=level(b.level);const vs=vitals(b)
 if(v.triage_level&&!opt(b.note)&&v.triage_level!==lv)throw new HttpError(400,'Write why the triage colour is changing.')
 await db.query('insert into er_triages(hospital_id,visit_id,level,vitals,note,triaged_by) values($1,$2,$3,$4,$5,$6)',[ctx.hospitalId,v.id,lv,JSON.stringify(vs),opt(b.note),ctx.userId])
 const r=(await db.query('update er_visits set triage_level=$3,triage_vitals=$4,triaged_at=now(),triaged_by=$5,first_triaged_at=coalesce(first_triaged_at,now()),chief_complaint=coalesce($6,chief_complaint) where id=$1 and hospital_id=$2 returning *',[v.id,ctx.hospitalId,lv,JSON.stringify(vs),ctx.userId,opt(b.chiefComplaint)])).rows[0]
 await audit(db,ctx,v.triage_level?'er_retriage':'er_triage','er_visit',v.id,{from:v.triage_level,to:lv,note:opt(b.note)});return r}

export async function assignDoctor(db:Db,ctx:Ctx,visitId:string,b:any){requireRole(ctx,[...ER]);const v=await visit(db,ctx,visitId);const d=await assertDoctor(db,ctx,b.doctorId)
 const r=(await db.query('update er_visits set doctor_id=$3 where id=$1 and hospital_id=$2 returning *',[v.id,ctx.hospitalId,d.id])).rows[0];await audit(db,ctx,'er_assign','er_visit',v.id,{doctor:d.full_name});return r}
/** The doctor has seen the patient: stops the door-to-doctor clock (first time only). */
export async function markSeen(db:Db,ctx:Ctx,visitId:string){requireRole(ctx,['admin','doctor']);const v=await visit(db,ctx,visitId);if(v.doctor_seen_at)return v
 const r=(await db.query('update er_visits set doctor_seen_at=now(),doctor_id=coalesce(doctor_id,$3) where id=$1 and hospital_id=$2 returning *',[v.id,ctx.hospitalId,ctx.role==='doctor'?ctx.userId:null])).rows[0]
 await audit(db,ctx,'er_seen','er_visit',v.id,{doorToDoctorMin:mins(r.arrived_at,r.doctor_seen_at)});return r}

/** Identify an unknown patient once the name is known: renames the temporary patient record. */
export async function identify(db:Db,ctx:Ctx,visitId:string,b:any){requireRole(ctx,[...ER]);const v=await visit(db,ctx,visitId,false);if(!v.unknown_patient)throw new HttpError(409,'This patient is already identified.')
 const p=await updatePatient(db,{...ctx,role:'reception'},v.patient_id,{fullName:required(b.fullName,'Name'),mobile:b.mobile,gender:b.gender||v.gender,dateOfBirth:b.dateOfBirth,address:b.address})
 await db.query('update er_visits set unknown_patient=false where id=$1',[v.id]);await audit(db,ctx,'er_identify','er_visit',v.id,{tempName:v.temp_name,name:p.full_name});return p}

const BOARD_SQL=`select v.*,p.full_name,p.uhid,p.mobile,p.gender p_gender,p.date_of_birth,d.full_name doctor,t.full_name triaged_by_name,m.id mlc_id,m.mlc_no,m.intimation_sent_at,(select count(*)::int from er_triages x where x.visit_id=v.id) triage_count
 from er_visits v join patients p on p.id=v.patient_id left join users d on d.id=v.doctor_id left join users t on t.id=v.triaged_by left join mlc_cases m on m.er_visit_id=v.id`
const RANK=`case v.triage_level when 'red' then 1 when 'orange' then 3 when 'yellow' then 4 when 'green' then 5 when 'black' then 6 else 2 end`
const shape=(v:any,now:Date)=>{const t=v.triage_level?TRIAGE[v.triage_level as TriageLevel]:null;const waiting=mins(v.arrived_at,v.doctor_seen_at||v.disposition_at||now);return {...v,waitingMin:mins(v.arrived_at,now),doorToDoctorMin:mins(v.arrived_at,v.doctor_seen_at),targetMin:t?t.target:null,overdue:!v.doctor_seen_at&&t?.target!=null&&(waiting??0)>t.target}}
/** The live board: open visits, red first, then not-yet-triaged, orange, yellow, green, black; longest wait first within a colour. */
export async function board(db:Db,ctx:Ctx,now=new Date()){requireRole(ctx,[...ER])
 const rows=(await db.query(`${BOARD_SQL} where v.hospital_id=$1 and v.disposition is null order by ${RANK},v.arrived_at`,[ctx.hospitalId])).rows.map((v:any)=>shape(v,now))
 const counts:Record<string,number>={red:0,orange:0,yellow:0,green:0,black:0,untriaged:0};for(const r of rows)counts[r.triage_level||'untriaged']++
 return {visits:rows,counts,doorToDoctor:await doorToDoctor(db,ctx,{from:istDate(now),to:istDate(now)})}}

/** Door-to-doctor time (arrival → doctor first sees the patient), per triage colour, over an IST date range. */
export async function doorToDoctor(db:Db,ctx:Ctx,q:{from?:string;to?:string}={}){requireRole(ctx,[...ER]);const d=/^\d{4}-\d{2}-\d{2}$/;const from=d.test(q.from||'')?q.from!:istDate(new Date()),to=d.test(q.to||'')?q.to!:from
 const r=(await db.query(`select coalesce(triage_level,'untriaged') level,count(*)::int seen,round(avg(extract(epoch from doctor_seen_at-arrived_at)/60))::int avg_min,round((percentile_cont(0.5) within group (order by extract(epoch from doctor_seen_at-arrived_at)/60))::numeric)::int median_min,max(round(extract(epoch from doctor_seen_at-arrived_at)/60))::int max_min
  from er_visits where hospital_id=$1 and doctor_seen_at is not null and (arrived_at at time zone 'Asia/Kolkata')::date between $2::date and $3::date group by 1`,[ctx.hospitalId,from,to])).rows
 const all=(await db.query(`select count(*)::int seen,round(avg(extract(epoch from doctor_seen_at-arrived_at)/60))::int avg_min from er_visits where hospital_id=$1 and doctor_seen_at is not null and (arrived_at at time zone 'Asia/Kolkata')::date between $2::date and $3::date`,[ctx.hospitalId,from,to])).rows[0]
 return {from,to,overall:{seen:all.seen,avgMin:all.avg_min},byLevel:Object.fromEntries(r.map((x:any)=>[x.level,{seen:x.seen,avgMin:x.avg_min,medianMin:x.median_min,maxMin:x.max_min,targetMin:(TRIAGE as any)[x.level]?.target??null}]))}}

export async function getVisit(db:Db,ctx:Ctx,id:string){requireRole(ctx,[...ER]);const v=(await db.query(`${BOARD_SQL} where v.id=$1 and v.hospital_id=$2`,[id,ctx.hospitalId])).rows[0];if(!v)throw new HttpError(404,'ER visit not found.')
 const triages=(await db.query('select t.*,u.full_name by_name from er_triages t left join users u on u.id=t.triaged_by where t.visit_id=$1 order by t.triaged_at',[id])).rows
 const mlc=v.mlc_id?await getMlc(db,ctx,v.mlc_id):null;return {visit:shape(v,new Date()),triages,mlc}}

/** Disposition closes the ER visit. An MLC cannot leave the ER until the police have been informed. "admitted" admits to IPD. */
export async function dispose(db:Db,ctx:Ctx,visitId:string,b:any){requireRole(ctx,[...ER]);const v=await visit(db,ctx,visitId);const kind=String(b.disposition||'')
 if(!(DISPOSITIONS as readonly string[]).includes(kind))throw new HttpError(400,'Choose a disposition: admitted, discharged, referred, LAMA, absconded or death.')
 if(kind!=='absconded'&&!['admin','doctor'].includes(ctx.role)&&!(kind==='admitted'&&ctx.role==='reception'))throw new HttpError(403,'Only a doctor can record this disposition.')
 if(v.is_mlc){const m=(await db.query('select mlc_no,intimation_sent_at,police_station from mlc_cases where er_visit_id=$1',[v.id])).rows[0];if(m&&(!m.intimation_sent_at||!m.police_station))throw new HttpError(409,`This is a medico-legal case (${m.mlc_no}). Record the police intimation before the patient leaves the ER.`,{code:'mlc_intimation_pending'})}
 if(kind==='referred'&&!opt(b.referredTo))throw new HttpError(400,'Write where the patient is referred to.')
 if(kind==='lama'&&!opt(b.note))throw new HttpError(400,'Write the LAMA reason and who signed the LAMA form.')
 const when=at(b.at,'Disposition time')||new Date();if(when<new Date(v.arrived_at))throw new HttpError(400,'Disposition time is before arrival.')
 let admissionId:string|null=null
 if(kind==='admitted'){const a=await admit(db,ctx,{patientId:v.patient_id,doctorId:b.doctorId||v.doctor_id||(ctx.role==='doctor'?ctx.userId:null),bedId:b.bedId,reason:opt(b.reason)||v.chief_complaint||'Admitted from emergency'});admissionId=a.id}
 const r=(await db.query('update er_visits set disposition=$3,disposition_at=$4,disposition_by=$5,disposition_note=$6,referred_to=$7,admission_id=$8 where id=$1 and hospital_id=$2 and disposition is null returning *',[v.id,ctx.hospitalId,kind,when,ctx.userId,opt(b.note),opt(b.referredTo),admissionId])).rows[0]
 if(!r)throw new HttpError(409,'This ER visit was closed by someone else.')
 await audit(db,ctx,'er_disposition','er_visit',v.id,{disposition:kind,admissionId,referredTo:opt(b.referredTo)});return r}

/* ---------- Medico-legal cases ---------- */
const MLC_FIELDS:Record<string,string>={mlcType:'mlc_type',typeDetail:'type_detail',incidentAt:'incident_at',incidentPlace:'incident_place',policeStation:'police_station',intimationSentAt:'intimation_sent_at',officerName:'officer_name',officerBuckleNo:'officer_buckle_no',broughtBy:'brought_by',identificationMarks:'identification_marks',injuries:'injuries',notes:'notes'}
function injuries(v:unknown){if(v==null||v==='')return [];let a:any=v;if(typeof v==='string'){try{a=JSON.parse(v)}catch{a=v.split('\n').map(s=>s.trim()).filter(Boolean).map(s=>({description:s}))}}if(!Array.isArray(a))throw new HttpError(400,'Injuries must be a list.')
 return a.slice(0,50).map((x:any)=>{const o=typeof x==='string'?{description:x}:x||{};const r:any={};for(const k of ['site','type','size','description','weapon','nature'])if(opt(o[k]))r[k]=String(o[k]).trim().slice(0,300);if(r.nature&&!['simple','grievous','dangerous'].includes(r.nature))throw new HttpError(400,'Injury nature must be simple, grievous or dangerous.');if(!Object.keys(r).length)throw new HttpError(400,'Describe each injury.');return r})}
function mlcValue(k:string,v:unknown){if(k==='mlc_type'){const s=String(v||'');if(!(s in MLC_TYPES))throw new HttpError(400,'Unknown MLC type.');return s}if(k==='incident_at'||k==='intimation_sent_at')return at(v,k==='incident_at'?'Incident time':'Intimation time')?.toISOString()??null;if(k==='injuries')return injuries(v);return opt(v)}
const same=(a:any,b:any)=>JSON.stringify(a instanceof Date?a.toISOString():a??null)===JSON.stringify(b instanceof Date?b.toISOString():b??null)

/** Doctor declares the ER visit a medico-legal case. Gets the next MLC number for the hospital and year. */
export async function markMlc(db:Db,ctx:Ctx,visitId:string,b:any){requireRole(ctx,['admin','doctor']);const v=await visit(db,ctx,visitId,false);if(v.is_mlc)throw new HttpError(409,'Already a medico-legal case.')
 const type=mlcValue('mlc_type',b.mlcType) as string;if(type==='other'&&!opt(b.typeDetail))throw new HttpError(400,'Describe the type of case.')
 const y=Number(istDate(new Date()).slice(0,4));const no=`MLC/${y}/${String(await nextCounter(db,ctx.hospitalId,'mlc',String(y))).padStart(4,'0')}`
 const sent=mlcValue('intimation_sent_at',b.intimationSentAt)
 const m=(await db.query('insert into mlc_cases(hospital_id,er_visit_id,patient_id,mlc_no,mlc_year,mlc_type,type_detail,incident_at,incident_place,police_station,intimation_sent_at,intimation_sent_by,officer_name,officer_buckle_no,brought_by,identification_marks,injuries,notes,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning *',
  [ctx.hospitalId,v.id,v.patient_id,no,y,type,opt(b.typeDetail),mlcValue('incident_at',b.incidentAt),opt(b.incidentPlace),opt(b.policeStation),sent,sent?ctx.userId:null,opt(b.officerName),opt(b.officerBuckleNo),opt(b.broughtBy)||v.brought_by,opt(b.identificationMarks),JSON.stringify(injuries(b.injuries)),opt(b.notes),ctx.userId])).rows[0]
 await db.query('update er_visits set is_mlc=true where id=$1',[v.id]);await audit(db,ctx,'mlc_create','mlc_case',m.id,{mlcNo:no,type,visitNo:v.visit_no});return m}

/** Amend an MLC. Nothing is overwritten silently: each change is stored with old and new value. Changing a value already recorded needs a reason. */
export async function amendMlc(db:Db,ctx:Ctx,id:string,b:any){requireRole(ctx,['admin','doctor','nurse']);const m=(await db.query('select * from mlc_cases where id=$1 and hospital_id=$2',[id,ctx.hospitalId])).rows[0];if(!m)throw new HttpError(404,'MLC not found.')
 if(m.status==='closed')throw new HttpError(409,'This MLC is closed. An admin must reopen it to amend.')
 const changes:Record<string,{from:any;to:any}>={};for(const [k,col] of Object.entries(MLC_FIELDS)){if(!(k in b))continue;const nv=mlcValue(col,b[k]);if((col==='incident_at'||col==='intimation_sent_at')&&m[col]&&nv&&Math.abs(new Date(m[col]).getTime()-new Date(nv as string).getTime())<60000)continue;if(!same(m[col],nv))changes[col]={from:m[col] instanceof Date?m[col].toISOString():m[col],to:nv}}
 if(!Object.keys(changes).length)return m
 if(changes.mlc_type&&ctx.role==='nurse')throw new HttpError(403,'Only a doctor can change the MLC type.')
 const overwrites=Object.entries(changes).some(([,c])=>c.from!=null&&!(Array.isArray(c.from)&&!c.from.length)&&c.from!=='');if(overwrites&&!opt(b.reason))throw new HttpError(400,'Write the reason for changing what is already recorded on the MLC.')
 const cols=Object.keys(changes);const vals=cols.map(c=>c==='injuries'?JSON.stringify(changes[c].to):changes[c].to)
 const sentBy=changes.intimation_sent_at&&changes.intimation_sent_at.to?`,intimation_sent_by=$${cols.length+3}`:''
 const r=(await db.query(`update mlc_cases set ${cols.map((c,i)=>c+'=$'+(i+3)).join(',')}${sentBy},updated_at=now() where id=$1 and hospital_id=$2 returning *`,[m.id,ctx.hospitalId,...vals,...(sentBy?[ctx.userId]:[])])).rows[0]
 await db.query('insert into mlc_amendments(hospital_id,mlc_id,changes,reason,changed_by) values($1,$2,$3,$4,$5)',[ctx.hospitalId,m.id,JSON.stringify(changes),opt(b.reason),ctx.userId])
 await audit(db,ctx,'mlc_amend','mlc_case',m.id,{mlcNo:m.mlc_no,fields:cols,reason:opt(b.reason)});return r}

/** Record that the police were informed (station, officer, buckle number). The intimation time defaults to now. */
export async function recordIntimation(db:Db,ctx:Ctx,id:string,b:any){return amendMlc(db,ctx,id,{policeStation:required(b.policeStation,'Police station'),intimationSentAt:b.intimationSentAt||new Date().toISOString(),officerName:b.officerName,officerBuckleNo:b.officerBuckleNo,reason:b.reason})}

export async function setMlcStatus(db:Db,ctx:Ctx,id:string,b:any){const close=b.status!=='open';requireRole(ctx,close?['admin','doctor']:['admin']);const m=(await db.query('select * from mlc_cases where id=$1 and hospital_id=$2',[id,ctx.hospitalId])).rows[0];if(!m)throw new HttpError(404,'MLC not found.')
 if(close&&!m.intimation_sent_at)throw new HttpError(409,'Record the police intimation before closing the MLC.');if(m.status===(close?'closed':'open'))return m;const reason=close?opt(b.reason):required(b.reason,'Reason for reopening')
 const r=(await db.query('update mlc_cases set status=$3,closed_at=$4,closed_by=$5,updated_at=now() where id=$1 and hospital_id=$2 returning *',[m.id,ctx.hospitalId,close?'closed':'open',close?new Date():null,close?ctx.userId:null])).rows[0]
 await db.query('insert into mlc_amendments(hospital_id,mlc_id,changes,reason,changed_by) values($1,$2,$3,$4,$5)',[ctx.hospitalId,m.id,JSON.stringify({status:{from:m.status,to:r.status}}),reason,ctx.userId]);await audit(db,ctx,close?'mlc_close':'mlc_reopen','mlc_case',m.id,{mlcNo:m.mlc_no,reason});return r}

const MLC_SQL=`select m.*,p.full_name,p.uhid,p.gender,p.date_of_birth,p.mobile,p.address patient_address,v.visit_no,v.arrived_at,v.arrival_mode,v.chief_complaint,v.triage_level,v.disposition,v.disposition_at,v.unknown_patient,v.approx_age,d.full_name doctor,d.registration_no doctor_reg,s.full_name intimation_by_name,c.full_name created_by_name
 from mlc_cases m join er_visits v on v.id=m.er_visit_id join patients p on p.id=m.patient_id left join users d on d.id=v.doctor_id left join users s on s.id=m.intimation_sent_by left join users c on c.id=m.created_by`
/** One MLC with its amendment trail and what the intimation letter needs (hospital letterhead, examining doctor). */
export async function getMlc(db:Db,ctx:Ctx,id:string){requireRole(ctx,[...ER]);const m=(await db.query(`${MLC_SQL} where m.id=$1 and m.hospital_id=$2`,[id,ctx.hospitalId])).rows[0];if(!m)throw new HttpError(404,'MLC not found.')
 const [am,h]=await Promise.all([db.query('select a.*,u.full_name by_name from mlc_amendments a left join users u on u.id=a.changed_by where a.mlc_id=$1 order by a.changed_at',[id]),db.query('select name,address,contact_phone,contact_email,logo_url from hospitals where id=$1',[ctx.hospitalId])])
 return {mlc:{...m,type_label:MLC_TYPES[m.mlc_type]},amendments:am.rows,hospital:h.rows[0]}}

/** The MLC register: filter by IST date range (when the MLC was opened), type and status. */
export async function mlcRegister(db:Db,ctx:Ctx,q:{from?:string;to?:string;type?:string;status?:string}={}){requireRole(ctx,[...ER]);const d=/^\d{4}-\d{2}-\d{2}$/
 return (await db.query(`${MLC_SQL} where m.hospital_id=$1 and ($2::date is null or (m.created_at at time zone 'Asia/Kolkata')::date>=$2::date) and ($3::date is null or (m.created_at at time zone 'Asia/Kolkata')::date<=$3::date) and ($4::text is null or m.mlc_type=$4) and ($5::text is null or m.status=$5) order by m.mlc_year desc,m.mlc_no desc limit 1000`,
  [ctx.hospitalId,d.test(q.from||'')?q.from:null,d.test(q.to||'')?q.to:null,q.type&&q.type in MLC_TYPES?q.type:null,q.status==='open'||q.status==='closed'?q.status:null])).rows.map((m:any)=>({...m,type_label:MLC_TYPES[m.mlc_type]}))}

const csvCell=(v:unknown)=>{let s=v==null?'':v instanceof Date?v.toISOString():typeof v==='object'?JSON.stringify(v):String(v);if(/^[=+\-@]/.test(s))s="'"+s;return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
const ist=(v:any)=>v?new Date(new Date(v).getTime()+330*60000).toISOString().slice(0,16).replace('T',' '):''
export async function mlcCsv(db:Db,ctx:Ctx,q:any={}){const rows=await mlcRegister(db,ctx,q)
 const head=['MLC no','Opened (IST)','Type','Patient','UHID','ER visit','Arrived (IST)','Incident (IST)','Place','Brought by','Police station','Intimation sent (IST)','Intimation by','Officer','Buckle no','Identification marks','Injuries','Doctor','Disposition','Status']
 const lines=rows.map((m:any)=>[m.mlc_no,ist(m.created_at),m.type_label+(m.type_detail?' – '+m.type_detail:''),m.full_name,m.uhid,m.visit_no,ist(m.arrived_at),ist(m.incident_at),m.incident_place,m.brought_by,m.police_station,ist(m.intimation_sent_at),m.intimation_by_name,m.officer_name,m.officer_buckle_no,m.identification_marks,(m.injuries||[]).map((i:any)=>[i.site,i.type,i.size,i.description,i.nature].filter(Boolean).join(' ')).join('; '),m.doctor,m.disposition,m.status].map(csvCell).join(','))
 await audit(db,ctx,'mlc_export','mlc_case',null,{rows:rows.length,filter:q});return [head.join(','),...lines].join('\r\n')+'\r\n'}
