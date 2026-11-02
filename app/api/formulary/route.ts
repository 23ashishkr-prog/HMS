import {api} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {formulary} from '@/lib/services/pharmacy'
export const GET=api(async(c,db)=>({medicines:await formulary(db,c)}),{module:'opd'})
