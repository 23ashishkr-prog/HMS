'use client'
import {useEffect} from 'react';import {reportClientError} from '@/components/ErrorReporter'
export default function GlobalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){useEffect(()=>{reportClientError(error)},[error]);return <html lang="en"><body style={{fontFamily:'system-ui',padding:40}}><h1>Something went wrong</h1><p>The tech team has been notified automatically.</p><button onClick={reset}>Try again</button></body></html>}
