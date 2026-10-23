'use client'
import {useEffect} from 'react';import {reportClientError} from '@/components/ErrorReporter'
export default function Error({error,reset}:{error:Error&{digest?:string};reset:()=>void}){useEffect(()=>{reportClientError(error)},[error]);return <main className="authPage"><section className="authCard"><h1>Something went wrong</h1><p>The tech team has been notified automatically.</p>{error.digest&&<p><small>Reference: {error.digest}</small></p>}<button className="primary full" onClick={reset}>Try again</button></section></main>}
