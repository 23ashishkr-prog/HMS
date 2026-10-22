import {Db} from './core'
/** Free follow-up rule: a visit to the same doctor within N days (hospital setting, default 7) of a billed consultation is covered
 *  by that invoice — no new consultation charge. After N days a new bill applies. Cancelled invoices never cover. */
export async function coverageFor(db:Db,hid:string,patientId:string,doctorId:string,visitDate:string,excludeQueueId?:string|null){
 const r=(await db.query(`select inv.id invoice_id,inv.invoice_no,q2.visit_date::text vd,h.followup_free_days n,(q2.visit_date+h.followup_free_days)::text valid_till
  from invoice_items i join doctor_queue q2 on q2.id=i.source_id join invoices inv on inv.id=i.invoice_id join hospitals h on h.id=q2.hospital_id
  where i.source_type='visit' and i.unit_price>0 and inv.status<>'cancelled' and q2.hospital_id=$1 and q2.patient_id=$2 and q2.doctor_user_id=$3
   and q2.visit_date<=$4::date and q2.visit_date>=$4::date-h.followup_free_days and ($5::uuid is null or q2.id<>$5) and h.followup_free_days>0
  order by q2.visit_date desc,q2.checked_in_at desc limit 1`,[hid,patientId,doctorId,visitDate,excludeQueueId||null])).rows[0]
 return r?{invoiceId:r.invoice_id,invoiceNo:r.invoice_no,validTill:String(r.valid_till).slice(0,10),fromVisit:String(r.vd).slice(0,10)}:null}
/** Mark a queue token as covered (idempotent). Returns the coverage or null. */
export async function applyCoverage(db:Db,hid:string,queueId:string){const q=(await db.query('select id,patient_id,doctor_user_id,visit_date::text vd,covered_by_invoice_id from doctor_queue where id=$1 and hospital_id=$2',[queueId,hid])).rows[0];if(!q)return null
 const billed=(await db.query("select 1 from invoice_items where source_type='visit' and source_id=$1",[q.id])).rows[0];if(billed)return null
 const c=await coverageFor(db,hid,q.patient_id,q.doctor_user_id,String(q.vd).slice(0,10),q.id);if(c)await db.query('update doctor_queue set covered_by_invoice_id=$2,covered_until=$3 where id=$1',[q.id,c.invoiceId,c.validTill]);return c}
