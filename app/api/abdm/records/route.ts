import {api} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {receivedRecords} from '@/lib/services/abdm'
export const GET=api(async(c,db)=>({records:await receivedRecords(db,c)}),{module:'patients'})
