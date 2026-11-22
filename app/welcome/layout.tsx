import type {Metadata} from 'next'

// /hms/welcome is the app's front door. GreyNova's /hms marketing page is the product page
// Google should rank, so this page points its canonical there instead of competing with it.
const productPage='https://greynova.in/hms'
const title='Hospital Cloud: Hospital Management Software | GreyNova'
const description='Front desk, doctor desk with voice notes, pharmacy, lab, IPD and billing for hospitals and clinics, with WhatsApp reminders.'

export const metadata:Metadata={
  title,
  description,
  alternates:{canonical:productPage},
  openGraph:{type:'website',url:productPage,siteName:'GreyNova',title,description,images:[{url:'https://greynova.in/assets/og-share.png',width:1200,height:630}]},
  twitter:{card:'summary_large_image',title,description,images:['https://greynova.in/assets/og-share.png']},
}

export default function WelcomeLayout({children}:{children:React.ReactNode}){return children}
