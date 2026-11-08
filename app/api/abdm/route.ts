import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {abdmOverview,saveSettings} from '@/lib/services/abdm'
export const GET=api(async(c,db)=>abdmOverview(db,c),{module:'patients'})
export const PUT=api(async(c,db,r)=>saveSettings(db,c,await body(r)),{module:'patients'})
