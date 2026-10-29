import './globals.css'
import ErrorReporter from '@/components/ErrorReporter';import AppMotion from '@/components/AppMotion'
import {baseBoot} from '@/lib/basePath'
export const metadata={title:'HMS · Hospital Cloud',description:'Hospital management and patient next-step coordination'};export const viewport={themeColor:'#f5f5f7',colorScheme:'light' as const}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:baseBoot}}/><script dangerouslySetInnerHTML={{__html:"try{var a=JSON.parse(localStorage.getItem('hms.appearance')||'{}'),d=document.documentElement;['theme','accent','density','font'].forEach(function(k){if(a[k])d.dataset[k]=a[k]})}catch(e){}"}}/></head><body><ErrorReporter/>{children}<AppMotion/></body></html>}
