import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {wardChart,addMedOrder,addChart,addNote} from '@/lib/services/nursing';import {HttpError} from '@/lib/services/core'
export const GET=api(async(c,db,_r,p)=>wardChart(db,c,p.id),{module:'ipd'})
/** action: order (doctor adds a medicine), chart (vitals / intake / output), note (nursing note or doctor round). */
export const POST=api(async(c,db,r,p)=>{const b=await body(r);if(b.action==='order')await addMedOrder(db,c,p.id,b);else if(b.action==='chart')await addChart(db,c,p.id,b);else if(b.action==='note')await addNote(db,c,p.id,b);else throw new HttpError(400,'Unknown action.');return wardChart(db,c,p.id)},{module:'ipd'})
