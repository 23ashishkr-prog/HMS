'use client'
import {useEffect,useState} from 'react';import ModuleShell from '@/components/ModuleShell';import {call,inr} from '@/lib/client'
const ist=()=>new Date(Date.now()+330*60000).toISOString().slice(0,10)
const shift=(d:string,n:number)=>new Date(new Date(d+'T00:00:00Z').getTime()+n*864e5).toISOString().slice(0,10)
function Row({l,v,tone}:{l:string;v:any;tone?:string}){return <div className={'coRow'+(tone?' '+tone:'')}><span>{l}</span><b>{v}</b></div>}
function Card({t,children}:{t:string;children:any}){return <section className="coCard"><h3>{t}</h3>{children}</section>}
export default function Page(){const[d,setD]=useState(ist()),[x,setX]=useState<any>(null),[m,setM]=useState(''),[busy,setBusy]=useState(false)
 const load=()=>call('/api/settings/closeout?date='+d).then(v=>{setX(v);setM('')}).catch(e=>setM(e.message));useEffect(()=>{load()},[d])
 const head=<div className="coBar noprint"><div className="coDate"><button type="button" className="ghost" aria-label="Previous day" onClick={()=>setD(shift(d,-1))}>‹</button><input type="date" value={d} max={ist()} onChange={e=>e.target.value&&setD(e.target.value)}/><button type="button" className="ghost" aria-label="Next day" disabled={d>=ist()} onClick={()=>setD(shift(d,1))}>›</button>{d!==ist()&&<button type="button" className="ghost" onClick={()=>setD(ist())}>Today</button>}</div><div className="coActs"><button type="button" className="ghost" onClick={()=>print()}>Print</button></div></div>
 if(!x)return <ModuleShell title="Daily close-out" eyebrow="END OF DAY">{head}<p className="muted">{m||'Loading…'}</p></ModuleShell>
 const r=x.report,s=x.settings,mo=r.money
 const G=({t,items}:{t:string;items:[string,any,string?][]})=><div className="coGroup"><small>{t}</small><div className="coKpis">{items.map(([l,v,tone])=><div key={l} className={'coKpi'+(tone?' '+tone:'')}><span>{l}</span><b>{v}</b></div>)}</div></div>
 return <ModuleShell title="Daily close-out" eyebrow="END OF DAY" description="The day's numbers in one place. It can be sent to you automatically every evening.">
  {head}
  <div className="coGroups">
   <G t="Money" items={[['Collected',inr(mo.collected),'good'],['Billed',inr(mo.billed)],['Outstanding',inr(mo.outstanding),mo.outstanding>0?'warn':'']]}/>
   <G t="OPD" items={[['Visits',r.opd.visits],['Seen',r.opd.seen],['New patients',r.patients.new]]}/>
   <G t="IPD" items={[['Admitted',r.ipd.admitted],['Discharged',r.ipd.discharged],['In-patients',r.ipd.inpatients]]}/>
   <G t="Lab & pharmacy" items={[['Lab reported',r.lab.reported],['Rx dispensed',r.pharmacy.dispensed],['Low stock',r.pharmacy.lowStock,r.pharmacy.lowStock>0?'warn':'']]}/>
  </div>
  <div className="coCards">
   <Card t="Money"><Row l="Invoices raised" v={mo.invoices}/><Row l="Discounts" v={inr(mo.discounts)}/>{mo.byMode.map((p:any)=><Row key={p.mode} l={'Collected · '+p.mode} v={`${inr(p.amount)} (${p.count})`}/>)}<Row l="Open bills" v={`${mo.openInvoices} · ${inr(mo.outstanding)}`} tone={mo.openInvoices?'warn':''}/>{mo.cancelledInvoices>0&&<Row l="Cancelled invoices" v={mo.cancelledInvoices} tone="warn"/>}</Card>
   <Card t="OPD by doctor">{r.opd.byDoctor?.length?<table className="dataTable coTable"><thead><tr><th>Doctor</th><th>Visits</th><th>Seen</th></tr></thead><tbody>{r.opd.byDoctor.map((b:any,i:number)=><tr key={i}><td>{b.doctor||b.name||'—'}</td><td>{b.visits}</td><td>{b.seen}</td></tr>)}</tbody></table>:<p className="muted small">No OPD visits.</p>}<Row l="Still waiting" v={r.opd.stillWaiting} tone={r.opd.stillWaiting?'warn':''}/><Row l="Appointments · no-show" v={`${r.opd.appointments} · ${r.opd.noShow}`}/></Card>
   <Card t="IPD"><Row l="Admitted / discharged" v={`${r.ipd.admitted} / ${r.ipd.discharged}`}/><Row l="In-patients" v={r.ipd.inpatients}/><Row l="Bed occupancy" v={r.ipd.occupancyPct==null?'—':`${r.ipd.occupancyPct}% of ${r.ipd.beds}`}/></Card>
   <Card t="Lab"><Row l="Ordered" v={r.lab.ordered}/><Row l="Reported" v={r.lab.reported}/><Row l="Pending" v={r.lab.pending} tone={r.lab.pending?'warn':''}/>{r.lab.importsPending>0&&<Row l="Machine results to match" v={r.lab.importsPending} tone="warn"/>}</Card>
   <Card t="Pharmacy"><Row l="Rx dispensed" v={r.pharmacy.dispensed}/><Row l="Sales value" v={inr(r.pharmacy.value)}/><Row l="Not collected" v={r.pharmacy.undispensed} tone={r.pharmacy.undispensed?'warn':''}/><Row l="Low-stock items" v={r.pharmacy.lowStock} tone={r.pharmacy.lowStock?'warn':''}/></Card>
   <Card t="Insurance"><Row l="New claims" v={r.claims.created}/><Row l="Settled" v={`${r.claims.settled} · ${inr(r.claims.settledAmount)}`}/><Row l="Awaiting insurer" v={r.claims.awaiting}/></Card>
  </div>
  <form className="coCard coSend noprint" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await call('/api/settings/closeout','PUT',{enabled:f.get('en')==='on',emails:String(f.get('emails')||''),whatsapp:String(f.get('wa')||''),time:String(f.get('time')||'21:00')});load();setM('Saved')}catch(er:any){setM(er.message)}}}>
   <div className="coSendHead"><div><h3>Send automatically</h3><p className="muted small">Every evening at the time below, by e-mail and WhatsApp. Needs e-mail / WhatsApp set up in Settings → Integrations.</p></div><label className="coSwitch"><input type="checkbox" name="en" defaultChecked={s.enabled}/> Send daily</label></div>
   <div className="coFields"><label>Time (IST)<input name="time" type="time" defaultValue={s.time}/></label><label>E-mail recipients<input name="emails" defaultValue={s.emails.join(', ')} placeholder="owner@hospital.in, accounts@hospital.in"/></label><label>WhatsApp numbers<input name="wa" defaultValue={s.whatsapp.join(', ')} placeholder="98xxxxxxxx, 97xxxxxxxx"/></label></div>
   <div className="coSendActs"><button className="primary" disabled={busy}>Save</button><button type="button" className="ghost" disabled={busy||!(s.emails.length+s.whatsapp.length)} onClick={async()=>{if(!confirm(`Send the ${d} report now to ${s.emails.length+s.whatsapp.length} recipient(s)?`))return;setBusy(true);try{const q=await call('/api/settings/closeout','POST',{date:d});setM(`Sending to ${q.queued} recipient(s).`)}catch(er:any){setM(er.message)}finally{setBusy(false)}}}>Send now</button>{m&&<small className="muted">{m}</small>}</div>
  </form></ModuleShell>}
