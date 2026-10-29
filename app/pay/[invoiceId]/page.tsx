'use client'
import {useEffect,useState} from 'react'
import {useParams} from 'next/navigation'
import {inr} from '@/lib/client'
import {withBase} from '@/lib/basePath'
/** Public payment link. Shows the hospital, invoice number and amount due — not the clinical record. */
export default function PayLink(){
 const {invoiceId}=useParams<{invoiceId:string}>()
 const[d,setD]=useState<any>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false),[amt,setAmt]=useState('')
 const load=()=>fetch(withBase('/api/pay/'+invoiceId),{cache:'no-store'}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Invoice not found');setD(j);setErr('')}).catch((e:any)=>setErr(e.message))
 useEffect(()=>{if(invoiceId)load()},[invoiceId])
 async function pay(){
  setBusy(true);setErr('')
  try{
   const body=amt.trim()?{amount:Number(amt)}:{}
   const r=await fetch(withBase('/api/pay/'+invoiceId),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
   const ord=await r.json().catch(()=>({}))
   if(!r.ok)throw new Error(ord.error||'Could not start payment')
   if(!(window as any).Razorpay){await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://checkout.razorpay.com/v1/checkout.js';s.onload=()=>res(null);s.onerror=()=>rej(new Error('Could not load the payment window'));document.body.appendChild(s)})}
   await new Promise<void>((resolve,reject)=>{
    const rzp=new (window as any).Razorpay({key:ord.keyId,amount:ord.amountPaise,currency:ord.currency,name:ord.hospitalName||'Hospital',description:ord.description,order_id:ord.orderId,
     handler:async(resp:any)=>{
      const c=await fetch(withBase('/api/pay/'+invoiceId+'/confirm'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(resp)})
      const j=await c.json().catch(()=>({}))
      if(!c.ok){reject(new Error(j.error||'Payment could not be recorded'));return}
      setD(j);resolve()
     },
     modal:{ondismiss:()=>reject(new Error('Checkout closed'))}})
    rzp.on('payment.failed',(resp:any)=>reject(new Error(resp?.error?.description||'Payment failed')))
    rzp.open()
   })
  }catch(e:any){if(e?.message&&e.message!=='Checkout closed')setErr(e.message)}
  finally{setBusy(false)}
 }
 return <main className="authPage"><div className="authCard" style={{maxWidth:440}}>
  <p className="eyebrow2">PAY INVOICE</p>
  {!d&&!err&&<p>Loading…</p>}
  {err&&<p className="err">{err}</p>}
  {d&&<>
   <h1 style={{fontSize:'1.6rem'}}>{d.hospitalName}</h1>
   <p>Invoice <b>{d.invoiceNo}</b></p>
   <p>Amount due <b>{inr(d.amountDue)}</b></p>
   <p><span className="pill">{d.status}</span></p>
   {d.online&&d.amountDue>=1&&<>
    <label>Amount ₹<input value={amt} onChange={e=>setAmt(e.target.value)} inputMode="decimal" placeholder={String(d.amountDue)}/></label>
    <p><button className="primary" disabled={busy} onClick={pay}>{busy?'Opening…':'Pay online'}</button></p>
   </>}
   {!d.online&&<p className="muted">Online payment is not available for this invoice. Please pay at the hospital desk.</p>}
  </>}
 </div></main>
}
