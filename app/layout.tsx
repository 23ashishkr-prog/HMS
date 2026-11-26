import './globals.css'
import ErrorReporter from '@/components/ErrorReporter';import AppMotion from '@/components/AppMotion';import {I18nProvider} from '@/components/I18n'
import {baseBoot} from '@/lib/basePath'
import {Inter} from 'next/font/google'
const inter=Inter({subsets:['latin'],display:'swap',variable:'--font-inter'})
export const metadata={title:'HMS · Hospital Cloud',description:'Hospital management and patient next-step coordination'};export const viewport={themeColor:'#f8fafc',colorScheme:'light' as const}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={inter.variable} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:baseBoot}}/><script dangerouslySetInnerHTML={{__html:"try{var lg=localStorage.getItem('hms.lang');if(lg)document.documentElement.lang=lg;var a={};try{a=JSON.parse(localStorage.getItem('hms.appearance')||'{}')}catch(e){}var d=document.documentElement,t=a.theme==='dark'?'dark':'light';d.dataset.themePref=t;d.dataset.theme=t;['density','font'].forEach(function(k){if(a[k])d.dataset[k]=a[k]})}catch(e){}"}}/></head><body><I18nProvider><ErrorReporter/>{children}<AppMotion/></I18nProvider></body></html>}
