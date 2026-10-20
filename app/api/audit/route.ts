import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {auditLog} from '@/lib/services/dashboard'
export const GET=api(async(c,db)=>({entries:await auditLog(db,c)}),{module:'audit'})
