import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {dispense} from '@/lib/services/pharmacy';import {tx} from '@/lib/services/auth';import {getDb} from '@/lib/db'
/** Dispense in one transaction: stock, dispensed lines and (cash-sale mode) the counter receipt commit together or not at all. */
export const POST=api(async(c,db,r,p)=>{const b=await body(r);return tx(getDb(),t=>dispense(t,c,p.id,b))},{module:'pharmacy',idempotent:true})
