import {test} from 'node:test'
import assert from 'node:assert/strict'
import {GATEWAY_ROLES,COLLECT_ROLES,captureHospitalGatewayPayment,createInvoiceGatewayOrder,listHospitalGatewayPayments,publicPayView} from '../lib/services/hospitalGateway'
import {mask,encrypt,decrypt} from '../lib/services/integrations'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {createInvoice,recordPayment,getInvoice} from '../lib/services/billing'

test('account role maps to billing — only admin+billing may manage hospital gateway',()=>{
 assert.deepEqual(GATEWAY_ROLES,['admin','billing'])
 assert.ok(!GATEWAY_ROLES.includes('doctor' as any))
 assert.ok(!GATEWAY_ROLES.includes('reception' as any))
 assert.ok(!GATEWAY_ROLES.includes('nurse' as any))
 assert.ok(!GATEWAY_ROLES.includes('lab' as any))
 assert.ok(!GATEWAY_ROLES.includes('pharmacy' as any))
})

test('hospital gateway secrets encrypt/mask like WhatsApp',()=>{
 if(!process.env.INTEGRATIONS_ENC_KEY&&!process.env.SESSION_SECRET){
  process.env.SESSION_SECRET='test-session-secret-for-gateway-unit'
 }
 const blob=encrypt({keyId:'rzp_test_hosp',keySecret:'hosp_sec',webhookSecret:'hosp_wh'})
 const out=decrypt(blob)
 assert.equal(out.keySecret,'hosp_sec')
 assert.equal(mask('rzp_test_ABCDEFGH'),'••••EFGH')
 assert.ok(!blob.includes('hosp_sec'))
})

test('platform and hospital gateway are separate modules',async()=>{
 const pg=await import('../lib/services/platformGateway')
 const hg=await import('../lib/services/hospitalGateway')
 assert.equal(typeof pg.getRazorpayCreds,'function')
 assert.equal(typeof hg.getHospitalGatewayCreds,'function')
 assert.notEqual(pg.getRazorpayCreds,hg.getHospitalGatewayCreds)
})

async function openBill(db:any,ctx:any,name:string,mobile:string,amount:number){
 const p=await registerPatient(db,ctx,{fullName:name,mobile,gender:'Female'})
 const inv=await createInvoice(db,ctx,{patientId:p.id,items:[{description:'Consult',unitPrice:amount}]})
 return {p,inv}
}
async function seedOrder(db:any,ctx:any,inv:any,patientId:string,orderId:string,amount:number){
 await db.query(`insert into hospital_gateway_payments(hospital_id,invoice_id,patient_id,gateway,amount_inr,status,provider_order_id,created_by) values($1,$2,$3,'razorpay',$4,'created',$5,$6)`,[ctx.hospitalId,inv.id,patientId,amount,orderId,ctx.userId])
}

test('hospital gateway posts online payments once, including partial and mixed with cash', async()=>{
 const db=await freshDb();const {admin,mk}=await tenant(db,'Gateway Hosp','basic')
 const doc=await mk('doctor','Dr No Pay'),rec=await mk('reception','Rita Desk')
 assert.ok(COLLECT_ROLES.includes('reception'));assert.ok(!COLLECT_ROLES.includes('doctor' as any))
 const {p,inv}=await openBill(db,admin,'Asha Rao','9876500101',1000)
 await assert.rejects(createInvoiceGatewayOrder(db,doc,inv.id),(e:any)=>e.status===403)
 await assert.rejects(createInvoiceGatewayOrder(db,rec,inv.id,5000),(e:any)=>e.status===400)
 await assert.rejects(createInvoiceGatewayOrder(db,admin,inv.id),(e:any)=>e.status===503)
 const view=await publicPayView(db,inv.id)
 assert.equal(view.invoiceNo,inv.invoice_no);assert.equal(view.online,false);assert.equal(view.keyId,null)
 assert.ok(!JSON.stringify(view).includes('Asha'));assert.ok(!('keySecret' in view))

 await seedOrder(db,admin,inv,p.id,'order_partial',400)
 const first=await captureHospitalGatewayPayment(db,{hospitalId:admin.hospitalId,orderId:'order_partial',paymentId:'pay_partial',amountInr:400,signatureOk:true})
 assert.equal(first.duplicate,false);assert.equal(first.amount,400)
 const again=await captureHospitalGatewayPayment(db,{hospitalId:admin.hospitalId,orderId:'order_partial',paymentId:'pay_partial',amountInr:400,signatureOk:true})
 assert.equal(again.duplicate,true)
 let full=await getInvoice(db,admin,inv.id)
 assert.equal(full.invoice.status,'partially_paid');assert.equal(full.totals.balance,600);assert.equal(full.payments.length,1)
 await db.query('delete from payments where provider_payment_id=$1',[ 'pay_partial'])
 const repaired=await captureHospitalGatewayPayment(db,{hospitalId:admin.hospitalId,orderId:'order_partial',paymentId:'pay_partial',amountInr:400,signatureOk:true})
 assert.equal(repaired.duplicate,false)
 assert.equal((await db.query('select count(*)::int n from payments where provider_payment_id=$1',['pay_partial'])).rows[0].n,1)

 await seedOrder(db,admin,inv,p.id,'order_rest',600)
 await captureHospitalGatewayPayment(db,{hospitalId:admin.hospitalId,orderId:'order_rest',paymentId:'pay_rest',amountInr:600,signatureOk:true})
 full=await getInvoice(db,admin,inv.id)
 assert.equal(full.totals.balance,0);assert.equal(full.invoice.status,'paid');assert.equal(full.payments.length,2)

 const {p:p2,inv:inv2}=await openBill(db,admin,'Bela Cash','9876500102',1000)
 await recordPayment(db,admin,inv2.id,{amount:300,mode:'cash',reference:'CASH-1'})
 await seedOrder(db,admin,inv2,p2.id,'order_mix',800)
 await assert.rejects(captureHospitalGatewayPayment(db,{hospitalId:admin.hospitalId,orderId:'order_mix',paymentId:'pay_over',amountInr:800,signatureOk:true}),(e:any)=>e.status===409)
 await seedOrder(db,admin,inv2,p2.id,'order_ok',700)
 await captureHospitalGatewayPayment(db,{hospitalId:admin.hospitalId,orderId:'order_ok',paymentId:'pay_ok',amountInr:700,signatureOk:true})
 const mixed=await getInvoice(db,admin,inv2.id)
 assert.equal(mixed.totals.balance,0);assert.equal(mixed.invoice.status,'paid')
 assert.deepEqual(mixed.payments.map((x:any)=>x.mode).sort(),['cash','razorpay'])
 assert.ok(mixed.payments.every((x:any)=>x.received_by_name))
 const list=await listHospitalGatewayPayments(db,admin,{})
 const onBill=list.payments.filter((r:any)=>r.invoice_id===inv2.id)
 const modes=onBill.filter((r:any)=>r.source==='payment').map((r:any)=>r.mode).sort()
 assert.deepEqual(modes,['cash','razorpay'])
 assert.ok(onBill.some((r:any)=>r.source==='attempt'&&r.provider_order_id==='order_mix'))
 assert.equal(list.stats.reconciled,true)
 assert.equal(Number(list.stats.payments_total),Number(list.stats.invoice_paid))
 assert.ok(Number(list.stats.online_total)>=700);assert.ok(Number(list.stats.manual_total)>=300)
})
