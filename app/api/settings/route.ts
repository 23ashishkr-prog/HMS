import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {getSettings,updateSettings} from '@/lib/services/tenancy'
export const GET=api(async(c,db)=>getSettings(db,c));export const PATCH=api(async(c,db,r)=>({hospital:await updateSettings(db,c,await body(r))}))
