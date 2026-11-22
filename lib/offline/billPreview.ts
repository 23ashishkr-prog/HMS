/**
 * What an offline bill looks like after a change that is still waiting to sync. Display only: the server
 * re-prices and re-totals everything when the queued change is replayed, and its answer replaces this.
 */
export type Svc={id:string;name:string;price:number|string}
const n=(v:any)=>Number(v)||0
export function retotal(inv:any){const gross=(inv.items||[]).reduce((s:number,i:any)=>s+n(i.unit_price)*(n(i.quantity)||1),0);const discount=n(inv.totals?.discount);const net=Math.max(0,gross-discount);const paid=n(inv.totals?.paid)
 return {...inv,totals:{...inv.totals,gross,discount,net,paid,balance:Math.max(0,net-paid)}}}
export function applyOffline(inv:any,action:string,b:Record<string,any>,services:Svc[]=[]):any{
 const cur={...inv,offline:true}
 if(action==='item'){const s=b.serviceId?services.find(x=>x.id===b.serviceId):null;const price=s?n(s.price):n(b.unitPrice);const description=s?s.name:String(b.description||'Item')
  return retotal({...cur,items:[...(cur.items||[]),{id:'off'+((cur.items||[]).length),description,quantity:n(b.quantity)||1,unit_price:price,pending:true}]})}
 if(action==='payment'){const amt=n(b.amount);const t=retotal(cur);const paid=n(t.totals.paid)+amt
  return {...t,payments:[...(t.payments||[]),{id:'offpay'+((t.payments||[]).length),amount:amt,mode:b.mode||'cash',pending:true}],totals:{...t.totals,paid,balance:Math.max(0,t.totals.net-paid)},invoice:{...t.invoice,status:paid>=t.totals.net&&t.totals.net>0?'paid':t.invoice.status}}}
 if(action==='discount')return retotal({...cur,totals:{...cur.totals,discount:n(b.discount)}})
 if(action==='cancel')return {...cur,invoice:{...cur.invoice,status:'cancelled'}}
 return cur}
