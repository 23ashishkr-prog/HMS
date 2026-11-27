import {withBase} from '@/lib/basePath'
import Link from 'next/link'
import type {ReactNode} from 'react'
import Logo from '@/components/Logo'
import {COMPANY_CIN,COMPANY_LEGAL_NAME,REFUND_POLICY_URL} from '@/lib/terms'

/** Outlined link back to greynova.in, with the GreyNova lockup (purple mark + GREYNOVA letters).
 *  `tone="light"` is for the dark brand panel. The light-text logo also shows in dark theme. */
export function BackToGreyNova({tone}:{tone?:'light'}){
 return <a className={'backGn'+(tone==='light'?' backGnLight':'')} href="https://www.greynova.in/" aria-label="Back to GreyNova">
  <span className="backGnArrow" aria-hidden="true">←</span>
  <span className="backGnTo" aria-hidden="true">Back to</span>
  <img className="backGnLogo backGnLogoDark" src={withBase('/greynova-logo.svg')} alt="" width={123} height={16}/>
  <img className="backGnLogo backGnLogoLight" src={withBase(tone==='light'?'/greynova-logo-white.svg':'/greynova-logo-light.svg')} alt="" width={123} height={16}/>
 </a>
}

/** Public header. The logo leads; the pill sits in the right-hand group. */
export function PublicHeader({links,end,narrow}:{links?:ReactNode;end?:ReactNode;narrow?:boolean}){
 return <header className="mkNav pubHead">
  <div className={'pubInner mkNavRow'+(narrow?' pubInnerNarrow':'')}>
   <Link className="mkLogo" href="/welcome"><Logo size={32}/> HMS</Link>
   <nav className="mkLinks" aria-label="Page">{links}<BackToGreyNova/>{end}</nav>
  </div>
 </header>
}

/** Logo and pill on one row, the same width as the card beneath. */
export function AccountHead(){
 return <div className="accountHead"><Link className="mkLogo" href="/welcome"><Logo size={28}/> HMS</Link><BackToGreyNova/></div>
}

export function PublicLegal({compact}:{compact?:boolean}){
 const year=new Date().getFullYear()
 return <footer className={'mkFoot'+(compact?' publicLegal':'')}>
  © {year} {COMPANY_LEGAL_NAME} · CIN {COMPANY_CIN}
  {' · '}<a href={REFUND_POLICY_URL}>Refund policy</a>
  {!compact&&<>{' · '}<Link href="/refund-terms">Refund &amp; Payment Terms</Link>{' · '}<Link href="/status">Patient visit status</Link>{' · '}<Link href="/auth/login">Staff sign in</Link></>}
 </footer>
}
