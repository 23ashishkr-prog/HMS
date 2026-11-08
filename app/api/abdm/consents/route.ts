import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {createConsentRequest,listConsents,PURPOSES} from '@/lib/services/abdm'
export const GET=api(async(c,db)=>({consents:await listConsents(db,c),purposes:PURPOSES}),{module:'patients'})
export const POST=api(async(c,db,r)=>createConsentRequest(db,c,await body(r)),{module:'patients',idempotent:true})
