import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {getSurgery,saveChecklist,startSurgery,saveOpNote,completeSurgery,cancelSurgery,updateSurgery} from '@/lib/services/ot';import {HttpError} from '@/lib/services/core'
export const GET=api(async(c,db,_r,p)=>getSurgery(db,c,p.id),{module:'ipd'})
/** action: checklist ({phase,answers}), start, note (operative note), complete, cancel ({reason}), update (move / re-team). */
export const POST=api(async(c,db,r,p)=>{const b=await body(r);let extra:any=null
 if(b.action==='checklist')extra=await saveChecklist(db,c,p.id,b.phase,b.answers);else if(b.action==='start')await startSurgery(db,c,p.id);else if(b.action==='note')await saveOpNote(db,c,p.id,b);else if(b.action==='complete')extra=(await completeSurgery(db,c,p.id)).charge;else if(b.action==='cancel')await cancelSurgery(db,c,p.id,b);else if(b.action==='update')await updateSurgery(db,c,p.id,b);else throw new HttpError(400,'Unknown action.')
 return {...await getSurgery(db,c,p.id),result:extra}},{module:'ipd'})
