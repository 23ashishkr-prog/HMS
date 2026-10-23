/** TV token display (public, read-only, keyed link) and near-turn patient notification. Shows token numbers + doctor names only — never patient names. */
import {Db,HttpError,today} from './core'
import {withBase} from '../basePath'
import {enqueue} from './notify'
import crypto from 'node:crypto'
export async function displayBoard(db:Db,code:string,key:string){const h=(await db.query('select id,name,display_key from hospitals where upper(code)=upper($1)',[String(code||'')])).rows[0];const a=Buffer.from(String(h?.display_key||'x')),b=Buffer.from(String(key||''));if(!h||a.length!==b.length||!crypto.timingSafeEqual(a,b))throw new HttpError(404,'Display link not valid.')
 const day=today();const rows=(await db.query("select q.token_no,q.status,q.called_at,u.id doctor_id,u.full_name doctor from doctor_queue q join users u on u.id=q.doctor_user_id where q.hospital_id=$1 and q.visit_date=$2 and q.status in ('waiting','called','consultation') order by u.full_name,q.token_no",[h.id,day])).rows
 const by=new Map<string,any>();for(const r of rows){const d=by.get(r.doctor_id)||{doctor:r.doctor,now:null as null|number,calledAt:null as null|string,next:[] as number[],waiting:0};if(r.status!=='waiting'){if(!d.calledAt||new Date(r.called_at)>new Date(d.calledAt)){d.now=r.token_no;d.calledAt=r.called_at}}else{d.waiting++;if(d.next.length<3)d.next.push(r.token_no)}by.set(r.doctor_id,d)}
 return {hospital:h.name,date:day,doctors:[...by.values()],at:new Date().toISOString()}}
/** After a token is called, tell the patient who is now N places away (consent-gated, once per token). */
export async function notifyNearTurn(db:Db,hid:string,doctorId:string){try{const h=(await db.query('select near_turn_ahead,name from hospitals where id=$1',[hid])).rows[0];const n=Math.max(1,Math.min(10,Number(h?.near_turn_ahead||2)))
 const w=(await db.query("select q.id,q.patient_id,q.token_no,u.full_name doctor from doctor_queue q join users u on u.id=q.doctor_user_id where q.hospital_id=$1 and q.doctor_user_id=$2 and q.visit_date=$3 and q.status='waiting' order by q.token_no",[hid,doctorId,today()])).rows;const t=w[n-1];if(!t)return null
 return await enqueue(db,{hospitalId:hid,patientId:t.patient_id,kind:'near_turn',body:`Token ${t.token_no}: your turn with ${t.doctor} is near (${n} ahead). Please be at the OPD waiting area.`,refType:'queue',refId:t.id,dedupe:'near:'+t.id})}catch{return null}}
export async function displayLink(db:Db,hid:string,rotate=false){if(rotate)await db.query("update hospitals set display_key=encode(gen_random_bytes(12),'hex') where id=$1",[hid]);const h=(await db.query('select code,display_key,near_turn_ahead from hospitals where id=$1',[hid])).rows[0];return {path:withBase(`/display?h=${h.code}&k=${h.display_key}`),nearTurnAhead:h.near_turn_ahead}}
