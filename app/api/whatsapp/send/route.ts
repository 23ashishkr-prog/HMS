import { NextResponse } from 'next/server'
export async function POST(req:Request){
 let body:any
 try{ body=await req.json() }catch{ return NextResponse.json({error:'Invalid JSON body'},{status:400}) }
 const {to,message}=body
 if(!to||!message)return NextResponse.json({error:'to and message are required'},{status:400})
 const phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID, token=process.env.WHATSAPP_ACCESS_TOKEN, version=process.env.WHATSAPP_GRAPH_API_VERSION||'v23.0'
 if(!phoneId||!token)return NextResponse.json({error:'WhatsApp Cloud API is not configured'},{status:503})
 const r=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:to.replace(/\D/g,''),type:'text',text:{body:message}})})
 const data=await r.json(); return NextResponse.json(data,{status:r.status})
}
