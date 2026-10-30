'use client'
import {Suspense,useEffect,useState} from 'react'
import {useRouter,useSearchParams} from 'next/navigation'
import ModuleShell from '@/components/ModuleShell'
import {call,formObj,inr,dt,me} from '@/lib/client'
import {withBase} from '@/lib/basePath'
import PayPlan from '@/components/PayPlan'
import HospitalPayments from '@/components/HospitalPayments'
import UsersAccess from '@/components/UsersAccess'
const ADMIN_TABS=['hospital','users','services','notifications','ai','subscription','support','payments'] as const
const LABEL:Record<string,string>={hospital:'Hospital',users:'Users & access',services:'Services',notifications:'Notifications',ai:'AI',subscription:'Subscription',support:'Support',payments:'Payments'}
function Settings(){const sp=useSearchParams(),router=useRouter();const[role,setRole]=useState(''),[s,setS]=useState<any>(null),[svc,setSvc]=useState<any[]>([]),[tab,setTab]=useState(''),[msg,setMsg]=useState('')
 const load=()=>{call('/api/settings').then(setS).catch(e=>setMsg(e.message));if(role==='admin')call('/api/catalog').then(x=>setSvc(x.services)).catch(()=>{})}
 useEffect(()=>{me().then(m=>{setRole(m.role);const allow:string[]=m.role==='billing'?['payments']:[...ADMIN_TABS];const want=sp.get('tab')==='staff'?'users':(sp.get('tab')||'');setTab(allow.includes(want)?want:(m.role==='billing'?'payments':'hospital'));call('/api/settings').then(setS).catch(e=>setMsg(e.message));if(m.role==='admin')call('/api/catalog').then(x=>setSvc(x.services)).catch(()=>{})}).catch(()=>{})},[sp])
 const pick=(t:string)=>{setTab(t);router.replace('/admin/settings?tab='+t)}
 const sub=(url:string,method:string,ok:string)=>async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=e.currentTarget;try{await call(url,method,formObj(e));if(method==='POST')f.reset();setMsg(ok);load()}catch(er:any){setMsg(er.message)}}
 if(!s||!role)return <ModuleShell title="Settings" eyebrow="TENANT" description="">{msg||'Loading…'}</ModuleShell>
 const h=s.hospital,sb=s.subscription,tabs=role==='billing'?['payments']:[...ADMIN_TABS]
 const subStatus=sb?.lifecycle?.status||sb?.status
 const section=sp.get('section')||''
 return <ModuleShell title="Settings" eyebrow={'TENANT · '+h.code} description={role==='billing'?'Payment gateway and the list of payments on bills.':'Hospital profile, people, prices and subscription.'}>
 <div className="tabs">{tabs.map(t=><button key={t} className={tab===t?'on':''} onClick={()=>pick(t)}>{LABEL[t]||t}</button>)}{role==='admin'&&<><a href={withBase('/checkin-qr')}><button type="button">Self check-in QR</button></a><a href={withBase('/admin/closeout')}><button type="button">Daily close-out</button></a></>}</div>
 {tab==='hospital'&&role==='admin'&&<form className="panel modulePanel" onSubmit={sub('/api/settings','PATCH','Settings saved')}><div className="formGrid"><label>Hospital name<input name="name" defaultValue={h.name}/></label><label>Address<input name="address" defaultValue={h.address||''}/></label><label>GSTIN<input name="gstin" defaultValue={h.gstin||''}/></label><label>UHID prefix<input name="uhidPrefix" defaultValue={h.uhid_prefix||''}/></label><label>Contact email<input name="contactEmail" defaultValue={h.contact_email||''}/></label><label>Contact phone<input name="contactPhone" defaultValue={h.contact_phone||''}/></label><label>Pharmacy charges<select name="pharmacyBilling" defaultValue={h.pharmacy_billing||'patient_bill'}><option value="patient_bill">Add dispensed medicines to the patient's bill</option><option value="cash_sale">Separate pharmacy cash sale (receipt at pharmacy counter)</option></select></label><label>Free follow-up window (days)<input name="followupFreeDays" type="number" min="0" max="60" defaultValue={h.followup_free_days??7}/><small>Same patient + same doctor within this many days of a billed consultation: no new consultation fee (0 = always bill).</small></label></div><p><small>Hospital code (used at login): <b>{h.code}</b></small></p><button className="primary">Save</button></form>}
 {tab==='notifications'&&role==='admin'&&<Notif/>}{tab==='ai'&&role==='admin'&&<AiSet/>}
 {tab==='users'&&role==='admin'&&<UsersAccess/>}
 {tab==='payments'&&<HospitalPayments section={section}/>}
 {tab==='services'&&role==='admin'&&<div className="panel modulePanel"><table className="dataTable"><thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Price</th></tr></thead><tbody>{svc.map(x=><tr key={x.id}><td>{x.code}</td><td>{x.name}</td><td>{x.category}</td><td>{inr(x.price)}</td></tr>)}</tbody></table>{svc.length===0&&<p className="emptyState">Add your consultation fees, lab tests and radiology studies here.</p>}<form className="formGrid" onSubmit={sub('/api/catalog','POST','Service added')}><label>Code *<input name="code" required/></label><label>Name *<input name="name" required/></label><label>Category<select name="category">{['consultation','lab','radiology','procedure','bed','other'].map(c=><option key={c}>{c}</option>)}</select></label><label>Price ₹ *<input name="price" type="number" step="0.01" required/></label><button className="primary">Add</button></form></div>}
 {tab==='subscription'&&role==='admin'&&<div className="panel modulePanel"><p>Plan <b>{sb?.plan_name}</b> · status <span className="pill">{subStatus}</span>{subStatus==='trialing'&&sb?.trial_ends_at&&<> · trial ends {dt(sb.trial_ends_at)}</>}{subStatus==='active'&&sb?.current_period_end&&<> · renews {dt(sb.current_period_end)}</>}</p>{!sb?.usable&&<p className="err">Subscription inactive: modules are locked.</p>}<table className="dataTable"><thead><tr><th>Plan</th><th>Modules</th><th>Users</th><th>Patients</th></tr></thead><tbody>{s.plans.map((p:any)=><tr key={p.code}><td><b>{p.name}</b></td><td>{p.modules.join(', ')}</td><td>{p.max_users??'Unlimited'}</td><td>{p.max_patients??'Unlimited'}</td></tr>)}</tbody></table><h3>Upgrade or renew</h3><PayPlan onPaid={load}/><p><small>Hospital admins manage only this hospital. The SaaS owner platform console is separate and not linked from here.</small></p></div>}
  {tab==='support'&&<SupportTickets/>}
{msg&&<div className="toast" onClick={()=>setMsg('')}>{msg}</div>}</ModuleShell>}
export default function Page(){return <Suspense fallback={null}><Settings/></Suspense>}

function Notif(){const[x,setX]=useState<any>(null),[m,setM]=useState('');useEffect(()=>{call('/api/settings/notifications').then(setX).catch(e=>setM(e.message))},[]);if(!x)return <div className="panel modulePanel">{m||'Loading…'}</div>;const s=x.settings,p=x.providers
 return <form className="panel modulePanel" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const g=(k:string)=>String(f.get(k)||'');try{await call('/api/settings/notifications','PATCH',{notifyWhatsapp:f.get('wa')==='on',notifyEmail:f.get('em')==='on',notifySms:f.get('sms')==='on',reminderTimes:{morning:g('morning'),afternoon:g('afternoon'),evening:g('evening'),night:g('night')},foodOffsetMin:Number(g('food')),followupHoldHours:Number(g('hold')),opdHours:{start:g('opdStart'),end:g('opdEnd'),slotMin:Number(g('slot'))},waTemplates:Object.fromEntries(['token','consult_done','prescription','med_reminder','lab_ready','receipt','discharge','followup_offer','followup_confirmed'].map(k=>[k,g('t_'+k)]).filter(([,v])=>v))});setM('Saved')}catch(er:any){setM(er.message)}}}>
 <p><small>Providers: WhatsApp {p.whatsapp?'configured':'not configured (dry-run)'} · E-mail {p.email?'configured':'not configured (dry-run)'} · SMS not available · Reply webhook {p.webhook?'on':'off'} · Worker cron {p.cron?'on':'off (CRON_SECRET missing)'}. Messages go only to patients who gave consent at the front desk.</small></p>
 <div className="formGrid"><label><input type="checkbox" name="wa" defaultChecked={s.notify_whatsapp}/> Send WhatsApp</label><label><input type="checkbox" name="em" defaultChecked={s.notify_email}/> Send e-mail</label><label><input type="checkbox" name="sms" defaultChecked={s.notify_sms}/> Send SMS</label>
 {['morning','afternoon','evening','night'].map(k=><label key={k}>{k[0].toUpperCase()+k.slice(1)} dose time (IST)<input name={k} type="time" defaultValue={s.reminder_times?.[k]||({morning:'08:00',afternoon:'14:00',evening:'18:00',night:'21:00'} as any)[k]}/></label>)}
 <label>Before/after food offset (min)<input name="food" type="number" min="0" max="120" defaultValue={s.food_offset_min}/></label><label>Follow-up slot hold (hours)<input name="hold" type="number" min="1" max="168" defaultValue={s.followup_hold_hours}/></label><label>OPD start<input name="opdStart" type="time" defaultValue={s.opd_hours?.start||'10:00'}/></label><label>OPD end<input name="opdEnd" type="time" defaultValue={s.opd_hours?.end||'17:00'}/></label><label>Slot length (min)<input name="slot" type="number" min="5" max="120" defaultValue={s.opd_hours?.slotMin||15}/></label></div>
 <h3>Approved WhatsApp template names (optional)</h3><div className="formGrid">{['token','consult_done','prescription','med_reminder','lab_ready','receipt','discharge','followup_offer','followup_confirmed'].map(k=><label key={k}>{k}<input name={'t_'+k} defaultValue={s.wa_templates?.[k]||''} placeholder="e.g. hms_update_v1"/></label>)}</div>
 <button className="primary">Save</button>{m&&<p>{m}</p>}</form>}
function AiSet(){const[x,setX]=useState<any>(null),[m,setM]=useState('');useEffect(()=>{call('/api/settings/ai').then(setX).catch(e=>setM(e.message))},[]);if(!x)return <div className="panel modulePanel">{m||'Loading…'}</div>
 return <form className="panel modulePanel" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{setX(await call('/api/settings/ai','PUT',{enabled:f.get('en')==='on',consent:f.get('co')==='on',cap:Number(f.get('cap'))}));setM('Saved')}catch(er:any){setM(er.message)}}}>
 <h3>AI doctor assistant</h3><p><small>Assistive only, not a diagnostic device: every output is labelled “AI suggestion – verify” and nothing is saved or sent until a clinician accepts it. Names, phone numbers, addresses and ABHA IDs are never sent to the AI provider. Plan: {x.planName||(x.plan?'included':'not on this plan')} · AI features: {(x.features||[]).map((f:any)=>f.name+(f.included?' (included)':' (missing)')).join('; ')||(x.plan?'included on AI + Customer Engagement':'missing — AI + Customer Engagement only')} · Usage limit: {x.plan?Number(x.cap||0).toLocaleString('en-IN')+' tokens / month':'none on this plan'} · This month: {x.used.toLocaleString('en-IN')} tokens, {x.calls} calls.{x.trialDaysLeft!=null?` · Trial days left: ${x.trialDaysLeft}`:''}</small></p>{!x.plan&&<div className="upgradeCard"><b>Upgrade to AI + Customer Engagement</b><p>AI doctor assistant and customer engagement are not on Clinic or Basic. Contact sales, or pay from Subscription after the owner enables the plan.</p><a href={withBase('/welcome#pricing')}>Pricing</a></div>}
 <div className="formGrid"><label><input type="checkbox" name="en" defaultChecked={x.enabled} disabled={!x.plan}/> Enable AI assistant</label><label><input type="checkbox" name="co" defaultChecked={x.consent}/> Patients are informed that de-identified data may be processed by an AI service</label><label>Monthly token cap<input type="number" name="cap" min={0} defaultValue={x.cap}/></label></div>
 <button className="primary">Save</button> <small>{m}</small></form>}

function SupportTickets(){
 const[list,setList]=useState<any[]>([])
 const[m,setM]=useState('')
 const[busy,setBusy]=useState(false)
 const load=()=>call('/api/admin/tickets').then(x=>setList(x.tickets||[])).catch(e=>setM(e.message))
 useEffect(()=>{load()},[])
 return <div className="panel modulePanel">
  <h3>Raise ticket / Report issue</h3>
  <p className="muted"><small>Hospital admins only. Tickets go to the SaaS owner (Platform → Incidents &amp; tickets). Auto-captured app errors are separate and appear as “errors” on the platform.</small></p>
  <form className="formGrid ticketForm" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setM('');try{await call('/api/admin/tickets','POST',{title:String(f.get('title')||''),description:String(f.get('description')||''),severity:String(f.get('severity')||'medium'),category:String(f.get('category')||'other')});(e.target as HTMLFormElement).reset();setM('Ticket submitted');load()}catch(er:any){setM(er.message)}finally{setBusy(false)}}}>
   <label>Title *<input name="title" required maxLength={160} placeholder="Short summary"/></label>
   <label>Severity<select name="severity" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
   <label>Category<select name="category" defaultValue="other"><option value="bug">Bug</option><option value="billing">Billing / plan</option><option value="access">Access / login</option><option value="feature">Feature request</option><option value="other">Other</option></select></label>
   <label style={{gridColumn:'1/-1'}}>Description *<textarea name="description" required maxLength={4000} placeholder="What happened, who is affected, steps to reproduce"/></label>
   <button className="primary" disabled={busy}>{busy?'Sending…':'Submit ticket'}</button>
  </form>
  {m&&<p>{m}</p>}
  <h3 style={{marginTop:24}}>Your tickets</h3>
  {list.length===0&&<p className="emptyState">No tickets yet.</p>}
  <table className="dataTable"><thead><tr><th>Status</th><th>Title</th><th>Severity</th><th>Category</th><th>Updated</th></tr></thead>
   <tbody>{list.map(t=><tr key={t.id}><td><span className={'pill pill-'+t.status}>{t.status}</span></td><td><b>{t.title}</b><br/><small className="muted">{t.message?.slice(0,120)}</small></td><td>{t.severity}</td><td>{t.category}</td><td>{dt(t.last_seen)}</td></tr>)}</tbody>
  </table>
 </div>
}
