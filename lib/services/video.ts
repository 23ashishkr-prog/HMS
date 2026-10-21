/** Video consultations: Google Calendar event + Meet link from the hospital's own Google connection
 *  (Settings > Integrations), platform service account as fallback, dry-run when neither is set. */
import {Db,HttpError} from './core'
import {createMeet} from './integrations'
import {enqueue} from './notify'
export async function setupVideo(db:Db,hid:string,appointmentId:string){const a=(await db.query("select a.id,a.scheduled_at,a.meet_url,a.patient_id,p.full_name,p.email,u.full_name doctor,u.email doctor_email,h.name hospital,h.opd_hours from appointments a join patients p on p.id=a.patient_id left join users u on u.id=a.doctor_user_id join hospitals h on h.id=a.hospital_id where a.id=$1 and a.hospital_id=$2",[appointmentId,hid])).rows[0];if(!a)throw new HttpError(404,'Appointment not found.')
 if(a.meet_url)return {meetUrl:a.meet_url,dryRun:false,reused:true}
 const start=new Date(a.scheduled_at),end=new Date(start.getTime()+(Number(a.opd_hours?.slotMin)||15)*60000)
 const m=await createMeet(db,hid,{summary:`Video consultation: ${a.full_name} with ${a.doctor||'doctor'}`,description:`${a.hospital} video consultation.`,start,end,attendees:[a.email,a.doctor_email].filter(Boolean)})
 await db.query("update appointments set mode='video',meet_url=coalesce($3,meet_url),meet_event_id=coalesce($4,meet_event_id) where id=$1 and hospital_id=$2",[a.id,hid,m.meetUrl,m.eventId])
 if(m.meetUrl)await enqueue(db,{hospitalId:hid,patientId:a.patient_id,kind:'booking',subject:`${a.hospital}: video consultation link`,body:`${a.hospital}: your video consultation with ${a.doctor||'the doctor'} is on ${start.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})}.\nJoin: ${m.meetUrl}`,links:[{label:'Join video consultation',url:m.meetUrl}],refType:'appointment',refId:a.id,dedupe:'meet:'+a.id})
 return {meetUrl:m.meetUrl,dryRun:m.dryRun,error:m.error||null}}
