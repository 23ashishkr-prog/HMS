import {api} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {googleAuthUrl} from '@/lib/services/integrations'
export const GET=api(async(c,db)=>googleAuthUrl(db,c))
