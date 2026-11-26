import type {Metadata} from 'next'

// Sign-up form: no search value of its own. Keep it out of the index (like TailDesk and Smart Shop
// sign-up) and point search engines at the /hms product page instead.
const title='Start your Hospital Cloud free trial | GreyNova'
const description='Create your Hospital Cloud account: 30-day free trial of hospital management software with front desk, doctor desk, pharmacy, lab and billing.'

export const metadata:Metadata={
  title,
  description,
  robots:{index:false,follow:true},
  alternates:{canonical:'https://www.greynova.in/hms'},
  openGraph:{type:'website',url:'https://www.greynova.in/hms',siteName:'GreyNova',title,description,images:[{url:'https://www.greynova.in/assets/og-share.png',width:1200,height:630}]},
}

export default function OnboardingLayout({children}:{children:React.ReactNode}){return children}
