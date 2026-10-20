'use client'
/** Browser helper: all screens read/write through the real API. */
export async function call<T=any>(url:string,method='GET',body?:unknown):Promise<T>{const r=await fetch(url,{method,cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('Request failed ('+r.status+')'));return j}
export const formObj=(e:React.FormEvent<HTMLFormElement>)=>Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string,string>
export const inr=(n:unknown)=>'₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})
export const dt=(s?:string)=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'—'
