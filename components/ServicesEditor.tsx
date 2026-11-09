'use client'
import {useEffect,useState} from 'react';import {call,formObj,inr} from '@/lib/client';import {toast} from '@/lib/toast'
const CATS=['consultation','lab','radiology','procedure','bed','pharmacy','other'],RATES=[0,5,12,18,28,40]
/** Settings → Services: list, search, edit price/name/tax of existing services, switch them off, and add new ones. Admin only. */
export default function ServicesEditor(){const[svc,setSvc]=useState<any[]>([]),[q,setQ]=useState(''),[cat,setCat]=useState(''),[off,setOff]=useState(false),[edit,setEdit]=useState<string|null>(null),[d,setD]=useState<any>({}),[busy,setBusy]=useState(false)
 const load=()=>call('/api/catalog?all=1').then(x=>setSvc(x.services)).catch(e=>toast(e.message,'err'))
 useEffect(()=>{load()},[])
 const start=(x:any)=>{setEdit(x.id);setD({name:x.name,category:x.category,price:Number(x.price),sac:x.sac_code,gstRate:Number(x.gst_rate)})}
 const save=async(x:any,patch?:any)=>{setBusy(true);try{const r=await call('/api/catalog','PATCH',{id:x.id,...(patch||d)});setSvc(s=>s.map(y=>y.id===x.id?r.service:y));setEdit(null);toast(patch?(patch.active?'Service switched on':'Service switched off'):'Saved '+r.service.code)}catch(e:any){toast(e.message,'err')}finally{setBusy(false)}}
 const add=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=e.currentTarget;try{await call('/api/catalog','POST',formObj(e));f.reset();toast('Service added');load()}catch(er:any){toast(er.message,'err')}}
 const ql=q.trim().toLowerCase(),rows=svc.filter(x=>(off||x.active)&&(!cat||x.category===cat)&&(!ql||x.code.toLowerCase().includes(ql)||x.name.toLowerCase().includes(ql)))
 const inactive=svc.filter(x=>!x.active).length
 return <div className="panel modulePanel">
  <div className="actionRow"><input className="moduleInput" placeholder="Search code or name" value={q} onChange={e=>setQ(e.target.value)}/><select className="moduleInput" value={cat} onChange={e=>setCat(e.target.value)}><option value="">All categories</option>{CATS.map(c=><option key={c}>{c}</option>)}</select>{inactive>0&&<label className="raToggle"><input type="checkbox" checked={off} onChange={e=>setOff(e.target.checked)}/> Show switched off ({inactive})</label>}</div>
  <p className="muted">Click <b>Edit</b> to change a price, name or tax. New prices apply to bills raised from now on; bills already raised keep their price.</p>
  <div className="tableScroll"><table className="dataTable svcTable"><thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Price</th><th>SAC</th><th>GST</th><th></th></tr></thead><tbody>{rows.map(x=>edit===x.id?<tr key={x.id} className="svcEditing">
   <td><b>{x.code}</b></td><td><input className="moduleInput" value={d.name} onChange={e=>setD({...d,name:e.target.value})}/></td>
   <td><select className="moduleInput" value={d.category} onChange={e=>setD({...d,category:e.target.value})}>{CATS.map(c=><option key={c}>{c}</option>)}</select></td>
   <td><input className="moduleInput svcPrice" type="number" min="0" step="0.01" value={d.price} autoFocus onChange={e=>setD({...d,price:e.target.value})} onKeyDown={e=>{if(e.key==='Enter')save(x);if(e.key==='Escape')setEdit(null)}}/></td>
   <td><input className="moduleInput svcSac" inputMode="numeric" value={d.sac} onChange={e=>setD({...d,sac:e.target.value})}/></td>
   <td><select className="moduleInput" value={d.gstRate} onChange={e=>setD({...d,gstRate:Number(e.target.value)})}>{RATES.map(r=><option key={r} value={r}>{r}%</option>)}</select></td>
   <td className="nowrap"><button className="primary small" disabled={busy} onClick={()=>save(x)}>Save</button> <button className="small" onClick={()=>setEdit(null)}>Cancel</button></td></tr>
  :<tr key={x.id} className={x.active?'':'svcOff'}><td>{x.code}</td><td>{x.name}{!x.active&&<small className="muted"> · off</small>}</td><td>{x.category}</td><td><b>{inr(x.price)}</b></td><td>{x.sac_code}</td><td>{Number(x.gst_rate)}%</td>
   <td className="nowrap"><button className="small" onClick={()=>start(x)}>Edit</button> <button className="small" disabled={busy} onClick={()=>save(x,{active:!x.active})}>{x.active?'Switch off':'Switch on'}</button></td></tr>)}</tbody></table></div>
  {svc.length===0?<p className="emptyState">Add your consultation fees, lab tests and radiology studies here.</p>:rows.length===0&&<p className="emptyState">No service matches.</p>}
  <h3>Add a service</h3><form className="formGrid" onSubmit={add}><label>Code *<input name="code" required/></label><label>Name *<input name="name" required/></label><label>Category<select name="category">{CATS.map(c=><option key={c}>{c}</option>)}</select></label><label>Price ₹ *<input name="price" type="number" step="0.01" min="0" required/></label><label>SAC code<input name="sac" inputMode="numeric" placeholder="9993"/></label><label>GST rate<select name="gstRate" defaultValue="0">{RATES.map(r=><option key={r} value={r}>{r}%</option>)}</select></label><button className="primary">Add</button></form>
 </div>}
