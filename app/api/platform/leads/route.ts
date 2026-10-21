import {platformApi} from '@/lib/api';import {listLeads} from '@/lib/services/leads';export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=platformApi(async db=>listLeads(db))
