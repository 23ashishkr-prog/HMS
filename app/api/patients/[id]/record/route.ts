import {api} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {patientRecord} from '@/lib/services/record'
export const GET=api(async(c,db,r,p)=>patientRecord(db,c,p.id))
