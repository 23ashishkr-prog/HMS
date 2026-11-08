import {api} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {wardDue} from '@/lib/services/nursing'
export const GET=api(async(c,db)=>({due:await wardDue(db,c)}),{module:'ipd'})
