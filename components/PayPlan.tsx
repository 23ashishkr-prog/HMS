'use client'
import {useEffect,useState} from 'react'
import {call} from '@/lib/client'
import {PLAN_ANNUAL_INR,PLAN_CATALOGUE,PLAN_NAME,PLAN_PRICE_INR,PlanCode} from '@/lib/plans'
import {InrChargeNote,PlanPrice} from '@/components/FxPrice'
import {MoneyBack,TermsAgree} from '@/components/TermsDocument'

declare global{interface Window{Razorpay?:any}}

function loadRzp():Promise<void>{
 return new Promise((resolve,reject)=>{
  if(typeof window==='undefined')return reject(new Error('client only'))
  if(window.Razorpay)return resolve()
  const s=document.createElement('script');s.src='https://checkout.razorpay.com/v1/checkout.js';s.async=true
  s.onload=()=>resolve();s.onerror=()=>reject(new Error('Could not load Razorpay Checkout'));document.body.appendChild(s)
 })
}

/** In-app / hold-screen plan picker + Razorpay checkout. Dry-run message when keys missing. */
export default function PayPlan({compact,onPaid}:{compact?:boolean;onPaid?:()=>void}){
 const[period,setPeriod]=useState<'monthly'|'annual'>('monthly')
 const[busy,setBusy]=useState<string|null>(null)
 const[msg,setMsg]=useState('')
 const[enabled,setEnabled]=useState<boolean|null>(null)
 const[role,setRole]=useState('admin')
 const[paid,setPaid]=useState<{name:string;inr:number;period:'monthly'|'annual'}|null>(null)
 const[agreed,setAgreed]=useState(false)
 const[sub,setSub]=useState<any>(null)
 useEffect(()=>{call('/api/subscription/status').then(x=>{setEnabled(!!x.paymentsEnabled);setRole(x.role||'admin');setSub(x);setAgreed(!!x.termsAgreedAt)}).catch(()=>setEnabled(false))},[])

 const pay=async(planCode:PlanCode)=>{
  if(role!=='admin'){setMsg('Ask your hospital admin to upgrade.');return}
  if(!agreed){setMsg('Agree to the Terms and Refund policy before payment.');return}
  setBusy(planCode);setMsg('')
  try{
   const order=await call('/api/subscription/checkout','POST',{planCode,period,termsAgreed:true})
   await loadRzp()
   await new Promise<void>((resolve,reject)=>{
    const rzp=new window.Razorpay!({
     key:order.keyId,amount:order.amountPaise,currency:order.currency,name:'HMS Hospital Cloud',
     description:order.description,order_id:order.orderId,
     notes:{hospital_id:undefined,plan_code:planCode,billing_period:period},
     prefill:{email:order.prefillEmail},
     theme:{color:'#1fb6c9'},
     handler:async(resp:any)=>{
      try{
       await call('/api/subscription/confirm','POST',{
        razorpay_order_id:resp.razorpay_order_id,razorpay_payment_id:resp.razorpay_payment_id,razorpay_signature:resp.razorpay_signature,planCode,
       })
       setPaid({name:PLAN_NAME[planCode],inr:order.amount,period})
       setMsg(PLAN_NAME[planCode]+' is active.')
       onPaid?.();resolve()
      }catch(e:any){reject(e)}
     },
     modal:{ondismiss:()=>reject(new Error('Payment cancelled'))},
    })
    rzp.on('payment.failed',(r:any)=>reject(new Error(r?.error?.description||'Payment failed')))
    rzp.open()
   })
  }catch(e:any){
   setMsg(e.message||'Could not start checkout')
  }finally{setBusy(null)}
 }

 const cancel=async()=>{
  setMsg('')
  try{const x=await call('/api/subscription/cancel','POST',{});setSub({...sub,cancelAtPeriodEnd:true});setMsg(x.enforced?'Renewal cancelled. Access continues until the end of this paid period.':'Renewal cancelled. This hospital is on an earlier plan, so access is unchanged until the next payment.')}
  catch(e:any){setMsg(e.message)}
 }
 return <div className={'payPlan'+(compact?' compact':'')}>
  <MoneyBack/>
  <div className="payPeriod">{(['monthly','annual'] as const).map(p=><button key={p} type="button" className={period===p?'on':''} onClick={()=>setPeriod(p)}>{p==='monthly'?'Monthly':'Annual (10×)'}</button>)}</div>
  {enabled===false&&<p className="banner warn">Online payment is not set up yet (Razorpay keys missing on the server). Your admin can still be activated offline by the platform team — never treat this screen as a successful payment.</p>}
  <div className="payGrid">{PLAN_CATALOGUE.map(p=>{
   const price=period==='annual'?PLAN_ANNUAL_INR[p.code]:PLAN_PRICE_INR[p.code]
   return <article key={p.code} className={p.code==='engage_support'?'hot':''}>
    <h3>{p.name}</h3>
    {p.supportAdmins>0&&<small className="fxApprox">Dedicated support admin included</small>}
    <PlanPrice inr={price} per={period==='annual'?'year':'month'}/>
    <p>{p.blurb}</p>
    <button type="button" className="primary" disabled={!!busy||enabled===false||role!=='admin'||!agreed} onClick={()=>pay(p.code)}>
     {busy===p.code?'Opening Razorpay…':enabled===false?'Payments unavailable':'Pay'}
    </button>
    <InrChargeNote inr={price}/>
   </article>
  })}</div>
  <TermsAgree checked={agreed} onChange={setAgreed}/>
  {sub?.status==='active'&&sub?.renewalPolicy&&!sub.cancelAtPeriodEnd&&<p><button type="button" className="ghost" onClick={cancel}>Cancel renewal</button></p>}
  {sub?.cancelAtPeriodEnd&&<p className="muted">Renewal is cancelled. Access continues until the end of the paid period.</p>}
  <p className="muted"><small>Prices exclude GST. This pays for your hospital&apos;s software plan only — not patient bills. Plan activates only after Razorpay confirms payment. Monthly plans renew until you cancel.</small></p>
  {paid&&<div className="fxPaid" role="status"><b>{paid.name} is active.</b></div>}
  {msg&&!paid&&<p className={/active|cancelled|continues/i.test(msg)?'ok':'err'} role="status">{msg}</p>}
 </div>
}
