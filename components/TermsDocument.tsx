'use client'
import Link from 'next/link'
import {REFUND_POLICY_URL,TERMS_CLAUSES,TERMS_STANDFIRST,TERMS_TITLE,TERMS_VERSION} from '@/lib/terms'

export function MoneyBack(){
 return <p className="moneyBack">30-day money-back guarantee on your first payment.</p>
}

export function TermsDocument(){
 return <article className="legalDoc">
  <h1>{TERMS_TITLE}</h1>
  <p className="muted">{TERMS_STANDFIRST}</p>
  <p>The same terms are published at <a href={REFUND_POLICY_URL}>greynova.in/refund-policy.html</a>. This page is the Hospital Cloud copy, version {TERMS_VERSION}.</p>
  <ol>{TERMS_CLAUSES.map(c=><li key={c.slice(0,24)}>{c}</li>)}</ol>
  <p><Link href="/welcome#pricing">Pricing</Link> · <Link href="/onboarding?plan=clinic">Clinic trial</Link></p>
 </article>
}

export function TermsAgree({checked,onChange}:{checked:boolean;onChange:(v:boolean)=>void}){
 return <label className="termsAgree">
  <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>
  <span>I agree to the <Link href="/refund-terms">Terms</Link> and <a href={REFUND_POLICY_URL} target="_blank" rel="noreferrer">Refund policy</a></span>
 </label>
}
