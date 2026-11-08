import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {recordDose,stopMedOrder} from '@/lib/services/nursing'
/** action: dose (chart a dose: given / held / refused / missed), stop (doctor stops the medicine). */
export const POST=api(async(c,db,r,p)=>{const b=await body(r);return b.action==='stop'?{order:await stopMedOrder(db,c,p.id,b)}:{dose:await recordDose(db,c,p.id,b)}},{module:'ipd'})
