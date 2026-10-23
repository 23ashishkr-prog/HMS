import {platformApi} from '@/lib/api'
import {platformListPayments} from '@/lib/services/tenancy'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** SaaS-owner only: ledger of plan subscription payments for one hospital (not patient bills). */
export const GET=platformApi(async(db,_req,p)=>({payments:await platformListPayments(db,p.id)}))
