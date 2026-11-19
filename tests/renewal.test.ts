import {test} from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {lifecycleView,runLifecycle} from '../lib/services/lifecycle'
import {applyProviderEvent,getSubscription} from '../lib/services/tenancy'

const DAY=86400000

test('a lapsed grandfathered plan stays fully active; a new payment uses read-only then suspension',async()=>{
 const db=await freshDb()
 const old=await tenant(db,'Sudipta_Test','ai_engage')
 await db.query("update subscriptions set status='active',current_period_end=now()-interval '40 days',amount_in_inr=1999 where hospital_id=$1",[old.admin.hospitalId])
 await runLifecycle(db)
 let kept=await getSubscription(db,old.admin.hospitalId)
 assert.equal(kept.renewal_policy,null)
 assert.equal(kept.status,'active')
 assert.equal(kept.usable,true)
 assert.equal(kept.readOnly,false)

 const neu=await tenant(db,'New Pay','clinic')
 await applyProviderEvent(db,neu.admin.hospitalId,{type:'payment.captured',planCode:'clinic',period:'monthly',paymentId:'pay_new_1',orderId:'order_new_1',amountInr:1989},{})
 await db.query("update subscriptions set current_period_end=now()-interval '8 days' where hospital_id=$1",[neu.admin.hospitalId])
 let row=(await db.query('select * from subscriptions where hospital_id=$1',[neu.admin.hospitalId])).rows[0]
 const view=lifecycleView(row,new Date())
 if(!view)throw new Error('missing lifecycle')
 assert.equal(row.renewal_policy,'2026-11-19')
 assert.equal(view.readOnly,true)
 assert.equal(view.onHold,false)
 await runLifecycle(db)
 let live=await getSubscription(db,neu.admin.hospitalId)
 assert.equal(live.status,'active')
 assert.equal(live.usable,true)

 await db.query("update subscriptions set current_period_end=now()-interval '31 days' where hospital_id=$1",[neu.admin.hospitalId])
 await runLifecycle(db)
 live=await getSubscription(db,neu.admin.hospitalId)
 assert.equal(live.status,'on_hold')
 assert.equal(live.usable,false)
 const hold=new Date(live.hold_started_at).getTime()
 const purge=new Date(live.lifecycle.purgeAt).getTime()
 assert.ok(Math.abs(purge-(hold+30*DAY))<2*DAY,'export window is 30 days after suspension')
 kept=await getSubscription(db,old.admin.hospitalId)
 assert.equal(kept.status,'active')
 assert.equal(kept.usable,true)
})
