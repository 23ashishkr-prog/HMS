import {api} from '@/lib/api';import {lastPrescription} from '@/lib/services/repeatrx';export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db,r,p)=>lastPrescription(db,c,p.id),{module:'opd'})
