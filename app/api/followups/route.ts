import {api} from '@/lib/api';import {listFollowups} from '@/lib/services/patientcomms';import {requireRole} from '@/lib/services/core';export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db)=>{requireRole(c,['admin','reception','doctor']);return {followups:await listFollowups(db,c)}},{module:'appointments'})
