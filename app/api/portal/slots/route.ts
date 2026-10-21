import {portalApi} from '@/lib/patientauth';import {bookingInfo} from '@/lib/services/publicbook';export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=portalApi(async(c,db,r)=>{const u=new URL(r.url);return bookingInfo(db,c.code,u.searchParams.get('doctorId'),u.searchParams.get('date'),true)})
