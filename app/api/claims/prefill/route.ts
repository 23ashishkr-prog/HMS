import {api,qs} from '@/lib/api';import {prefillClaim} from '@/lib/services/claimpacket';export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db,r)=>prefillClaim(db,c,qs(r,'patientId'),qs(r,'admissionId')||null),{module:'insurance'})
