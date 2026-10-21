import {api} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {emailInvite} from '@/lib/services/pwreset'
/** Admin e-mails a one-time "choose your password" link (72 h) to a staff member. */
export const POST=api(async(c,db,r,p)=>emailInvite(db,c,(await p).id))
