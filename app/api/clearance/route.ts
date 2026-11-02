import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {HttpError} from '@/lib/services/core'
import {clearanceView,clearanceWorklist,requestClearance,signDepartment,finalizeClearance,cancelClearance,billPending,signAllReady} from '@/lib/services/clearance'
/** GET ?patientId= → one patient's checklist; GET → open clearances (mine=1: only those waiting for my department). */
export const GET=api(async(c,db,r)=>{const pid=qs(r,'patientId');return pid?clearanceView(db,c,pid):{clearances:await clearanceWorklist(db,c,qs(r,'mine')==='1')}},{module:'billing'})
export const POST=api(async(c,db,r)=>{const b=await body(r);const pid=String(b.patientId||'')
 switch(b.action){case 'request':return requestClearance(db,c,pid,b);case 'sign':return signDepartment(db,c,pid,b.department,{note:b.note});case 'hold':return signDepartment(db,c,pid,b.department,{note:b.note,hold:true})
  case 'bill':return billPending(db,c,pid);case 'finalize':return finalizeClearance(db,c,pid);case 'cancel':return cancelClearance(db,c,pid);case 'sign_all_ready':return signAllReady(db,c,b.department)
  default:throw new HttpError(400,'Unknown action')}},{module:'billing'})
