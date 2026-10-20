import {platformApi} from '@/lib/api';import {platformListHospitals} from '@/lib/services/tenancy';export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=platformApi(async db=>({hospitals:await platformListHospitals(db)}))
