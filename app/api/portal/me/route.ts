import {portalApi} from '@/lib/patientauth';import {portalData} from '@/lib/services/portal';export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=portalApi(async(c,db)=>({...await portalData(db,c),code:c.code}))
