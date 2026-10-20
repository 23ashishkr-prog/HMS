/** Repeat last prescription: returns the patient's most recent Rx lines + deterministic safety checks (allergy/duplicate/interaction/dose). */
import {Ctx,Db,assertPatient,requireRole} from './core'
import {patientContext,safetyChecks} from '../ai/clinical'
export async function lastPrescription(db:Db,ctx:Ctx,patientId:string){requireRole(ctx,['doctor','admin']);await assertPatient(db,ctx,patientId)
 const rx=(await db.query("select p.id,p.created_at,u.full_name doctor from prescriptions p join users u on u.id=p.doctor_user_id where p.hospital_id=$1 and p.patient_id=$2 and p.status<>'cancelled' order by p.created_at desc limit 1",[ctx.hospitalId,patientId])).rows[0]
 if(!rx)return {found:false,lines:[],warnings:[]}
 const lines=(await db.query('select medicine_name medicine,coalesce(dose,\'\') dose,coalesce(frequency,\'\') frequency,coalesce(duration,\'\') duration,coalesce(instructions,\'\') instructions from prescription_items where prescription_id=$1 order by medicine_name',[rx.id])).rows
 const c=await patientContext(db,ctx.hospitalId,patientId);const p=(await db.query('select allergies from patients where id=$1',[patientId])).rows[0]
 // active meds excluding the ones being repeated, so repeating isn't flagged as duplicate of itself
 const names=new Set(lines.map((l:any)=>l.medicine.toLowerCase()));const active=(c?.activeMeds||[]).filter((m:string)=>![...names].some(n=>m.toLowerCase().includes(n)||n.includes(m.toLowerCase())))
 return {found:true,prescriptionId:rx.id,date:rx.created_at,doctor:rx.doctor,lines,warnings:safetyChecks(lines,{allergies:p?.allergies||null,activeMeds:active,ageYears:c?.ageYears??null,weightKg:c?.weightKg??null})}}
