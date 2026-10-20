'use client'
export type ToastKind='ok'|'err'|'info'
export function toast(msg:string,kind:ToastKind='ok'){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('hms-toast',{detail:{msg,kind}}))}
export const toastErr=(e:any)=>toast(e?.message||String(e),'err')
