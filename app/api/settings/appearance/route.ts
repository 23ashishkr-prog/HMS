import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {setHospitalAppearance} from '@/lib/services/appearance'
export const PUT=api(async(c,db,r)=>setHospitalAppearance(db,c,await body(r)))
