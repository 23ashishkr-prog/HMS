import Link from 'next/link'
import {withBase} from '@/lib/basePath'
import {COMPANY_CIN,COMPANY_LEGAL_NAME,REFUND_POLICY_URL} from '@/lib/terms'

/** Public pages only. Logged-in hospital screens do not render this. */
export function BackToGreyNova({float}:{float?:boolean}){
 return <a className={'backGn'+(float?' backGnFloat':'')} href="https://greynova.in/" aria-label="Back to GreyNova">
  <span className="backGnArrow" aria-hidden="true">←</span>
  <img className="backGnMark" src={withBase('/greynova-logo.png')} alt="" width={22} height={22}/>
  <span className="backGnLong">Back to GreyNova</span>
  <span className="backGnShort">GreyNova</span>
 </a>
}

export function PublicLegal({compact}:{compact?:boolean}){
 const year=new Date().getFullYear()
 return <footer className={'mkFoot'+(compact?' publicLegal':'')}>
  © {year} {COMPANY_LEGAL_NAME} · CIN {COMPANY_CIN}
  {' · '}<a href={REFUND_POLICY_URL}>Refund policy</a>
  {!compact&&<>{' · '}<Link href="/refund-terms">Refund &amp; Payment Terms</Link>{' · '}<Link href="/status">Patient visit status</Link>{' · '}<Link href="/auth/login">Staff sign in</Link></>}
 </footer>
}
