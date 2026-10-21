import {api} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {doctorStatuses} from '@/lib/services/doctorsched';import {HttpError} from '@/lib/services/core'
export const GET=api(async(c,db)=>{if(c.role==='patient')throw new HttpError(403,'Forbidden');return {doctors:await doctorStatuses(db,c.hospitalId)}})
