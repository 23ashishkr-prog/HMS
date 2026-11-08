import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {settingsView,saveSettings} from '@/lib/services/nhcx'
export const GET=api(async(c,db)=>settingsView(db,c),{module:'insurance'})
export const PUT=api(async(c,db,r)=>saveSettings(db,c,await body(r)),{module:'insurance'})
