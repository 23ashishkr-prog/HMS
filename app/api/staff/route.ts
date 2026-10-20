import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {createStaff,listStaff} from '@/lib/services/tenancy'
export const GET=api(async(c,db)=>({users:await listStaff(db,c)}));export const POST=api(async(c,db,r)=>({user:await createStaff(db,c,await body(r))}))
