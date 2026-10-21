import './globals.css'
import {Poppins,Open_Sans} from 'next/font/google';import ErrorReporter from '@/components/ErrorReporter'
const heading=Poppins({subsets:['latin'],weight:['500','600','700'],variable:'--font-heading',display:'swap'})
const bodyFont=Open_Sans({subsets:['latin'],weight:['400','500','600','700'],variable:'--font-body',display:'swap'})
export const metadata={title:'HMS · Hospital Cloud',description:'Hospital management and patient next-step coordination'};export const viewport={themeColor:'#104176',colorScheme:'light'}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={`${heading.variable} ${bodyFont.variable}`} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:"try{var a=JSON.parse(localStorage.getItem('hms.appearance')||'{}'),d=document.documentElement;['theme','accent','density','font'].forEach(function(k){if(a[k])d.dataset[k]=a[k]})}catch(e){}"}}/></head><body><ErrorReporter/>{children}</body></html>}
