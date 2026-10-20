import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {addMedicine,receiveStock,stock,pharmacyBillingMode} from '@/lib/services/pharmacy'
export const GET=api(async(c,db)=>({stock:await stock(db,c),billingMode:await pharmacyBillingMode(db,c.hospitalId)}),{module:'pharmacy'})
export const POST=api(async(c,db,r)=>{const b=await body(r);return b.action==='receive'?{batch:await receiveStock(db,c,b)}:{medicine:await addMedicine(db,c,b)}},{module:'pharmacy'})
