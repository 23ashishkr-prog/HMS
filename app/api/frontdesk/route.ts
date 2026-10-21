import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {frontDeskVisit,consultationFee} from '@/lib/services/flows';import {listQueue} from '@/lib/services/opd';import {doctorStatuses} from '@/lib/services/doctorsched'
export const GET=api(async(c,db)=>{const [queue,doctors,fee]=await Promise.all([listQueue(db,c),doctorStatuses(db,c.hospitalId),consultationFee(db,c)]);return {queue,doctors,fee}},{module:'queue'})
export const POST=api(async(c,db,r)=>frontDeskVisit(db,c,await body(r)),{module:'queue',idempotent:true})
