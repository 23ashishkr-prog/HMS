import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {saveShifts,roster} from '../lib/services/roster'
import {addMedicine} from '../lib/services/pharmacy'
import {saveSupplier,setMedicineReorder} from '../lib/services/reorder'
import {registerPatient} from '../lib/services/patients'
import {addBed,admit} from '../lib/services/ipd'
import {runAgent,decideProposal,agentHome,runScheduledAgents,saveAgentSettings} from '../lib/agents/agents'
import {askAgents,toolsFor} from '../lib/agents/tools'
import {coverage,covers,overlap,DEFAULT_COVER} from '../lib/agents/coverage'
import {__setLlmFetch} from '../lib/ai/llm'
const week=(days:number[],start:string,end:string,shift:string)=>days.map(day=>({day,start,end,shift}))

test('coverage rules: half-slot overlap, overnight wrap, pattern and leave gaps',()=>{
 assert.equal(overlap({day:1,start:'20:00',end:'08:00'},1,'Night'),720);assert.ok(covers([{day:6,start:'20:00',end:'08:00'}],6,'Night'),'Saturday night spills into Sunday')
 assert.ok(covers([{day:2,start:'09:00',end:'17:00'}],2,'Morning'));assert.ok(!covers([{day:2,start:'12:00',end:'15:00'}],2,'Morning'),'2 of 6 hours is not cover')
 const staff=[{id:'a',full_name:'A',role:'nurse',shifts:week([0,1,2,3,4,5,6],'08:00','14:00','Morning'),leaves:[{start_at:'2026-11-17T00:00:00Z',end_at:'2026-11-18T00:00:00Z'}]},{id:'b',full_name:'B',role:'nurse',shifts:[],leaves:[]},{id:'d',full_name:'Dr',role:'doctor',shifts:[],leaves:[]}]
 const g=coverage(staff,{nurse:{Morning:1,Night:1}},'2026-11-16',7)
 assert.equal(g.pattern.length,7,'night gap every day; doctors ignored');assert.ok(g.pattern.every(x=>x.slot==='Night'&&x.canCover[0]?.id==='b'))
 assert.equal(g.dated.length,1);assert.equal(g.dated[0].date,'2026-11-17');assert.deepEqual(g.dated[0].away,['A']);assert.equal(g.dated[0].canCover[0].id,'b')})

test('roster agent: proposals for gaps, approve adds the shift as the admin, refresh/expire, role limits',async()=>{const db=await freshDb();const T=await tenant(db,'Agent Roster');const n1=await T.mk('nurse','Nurse One'),n2=await T.mk('nurse','Nurse Two'),ph=await T.mk('pharmacy','Pharm R')
 await saveAgentSettings(db,T.admin,{cover:{nurse:{Morning:1,Evening:1}}})
 await saveShifts(db,T.admin,n1.userId,week([1,2,3,4,5,6],'08:00','14:00','Morning'))
 const r=await runAgent(db,T.admin,'roster');assert.ok(r);assert.ok(r!.proposals>=2,'evening gaps and Sunday morning')
 assert.ok(r!.findings.some((f:any)=>/No weekly roster for Pharmacy/.test(f.text)),'one finding for a role with no roster');assert.ok(!r!.findings.some((f:any)=>/^Pharmacy (Morning|Evening)/.test(f.text)),'no per-shift gaps for it')
 assert.ok(r!.findings.some((f:any)=>/^Nurse Evening: short on Sun, Mon, Tue, Wed, Thu, Fri, Sat/.test(f.text)),'gaps grouped by role and shift');assert.ok(r!.proposals<=8)
 let h=await agentHome(db,T.admin);const ps=h.proposals.filter((p:any)=>p.kind==='roster_shift');assert.ok(ps.length>=2);assert.ok(ps.filter((p:any)=>p.payload.userId===n2.userId).length===2,'nurse two is free; at most 2 suggestions per person per run');ps.sort((a:any,b:any)=>(b.payload.userId===n2.userId?1:0)-(a.payload.userId===n2.userId?1:0))
 await assert.rejects(decideProposal(db,ph,ps[0].id,{decision:'approve'}),/role/i)
 const ok=await decideProposal(db,T.admin,ps[0].id,{decision:'approve'});assert.equal(ok.status,'approved')
 const sh=(await roster(db,T.admin)).staff.find((x:any)=>x.id===n2.userId).shifts;assert.equal(sh.length,1,'shift saved');assert.equal(sh[0].start,ps[0].payload.add.start)
 await assert.rejects(decideProposal(db,T.admin,ps[0].id,{decision:'approve'}),/already/i)
 await decideProposal(db,T.admin,ps[1].id,{decision:'reject'})
 await runAgent(db,T.admin,'roster');h=await agentHome(db,T.admin);assert.ok(!h.proposals.some((p:any)=>p.id===ps[0].id||p.id===ps[1].id))
 await assert.rejects(runAgent(db,n1,'roster'),/admin/);await assert.rejects(runAgent(db,T.admin,'nope'),/Unknown agent/)})

test('pharmacy agent: one draft per supplier, edited quantities, PO only on approval, isolation',async()=>{const db=await freshDb();const T=await tenant(db,'Agent Pharm');const ph=await T.mk('pharmacy','Pharm P'),nu=await T.mk('nurse','Nurse P');const O=await tenant(db,'Agent Other')
 const sup=await saveSupplier(db,T.admin,{name:'MedSupply'});const m=await addMedicine(db,T.admin,{name:'Paracetamol',strength:'500mg',form:'tablet',unitPrice:2,reorderLevel:50})
 await setMedicineReorder(db,T.admin,m.id,{supplierId:sup.id,reorderLevel:50,reorderQty:200});await addMedicine(db,T.admin,{name:'ORS',form:'sachet',unitPrice:20,reorderLevel:10})
 const r=await runAgent(db,ph,'pharmacy_reorder');assert.equal(r!.proposals,2);assert.equal((await db.query('select count(*)::int n from purchase_orders where hospital_id=$1',[T.h.hospitalId])).rows[0].n,0,'no PO before approval')
 await runAgent(db,ph,'pharmacy_reorder');let h=await agentHome(db,ph);assert.equal(h.proposals.length,2,'re-run refreshes, no duplicates')
 const p=h.proposals.find((x:any)=>x.payload.supplierId===sup.id);assert.equal(p.payload.lines[0].qty,200)
 await assert.rejects(decideProposal(db,O.admin,p.id,{decision:'approve'}),/not found/i)
 await assert.rejects(decideProposal(db,ph,p.id,{decision:'approve',lines:[{medicineId:m.id,qty:-3}]}),/whole number/);assert.equal((await agentHome(db,ph)).proposals.length,2,'failed approval goes back to pending')
 const d=await decideProposal(db,ph,p.id,{decision:'approve',lines:[{medicineId:m.id,qty:150}]});assert.match((d.result as any).poNo,/^PO-/)
 const po=(await db.query("select p.status,i.quantity from purchase_orders p join purchase_order_items i on i.po_id=p.id where p.hospital_id=$1",[T.h.hospitalId])).rows;assert.deepEqual(po,[{status:'draft',quantity:150}])
 await runAgent(db,ph,'pharmacy_reorder');h=await agentHome(db,ph);assert.equal(h.proposals.find((x:any)=>x.payload.supplierId===sup.id).payload.lines[0].qty,50,'drafted 150 counts as on order: only 50 more suggested')
 await assert.rejects(runAgent(db,nu,'pharmacy_reorder'),/admin \/ pharmacy/);await assert.rejects(agentHome(db,nu),/not available/)
 assert.equal((await agentHome(db,O.admin)).proposals.length,0)})

test('staff brief, scheduled runs (no user), discharge checks, and the ask loop with tools',async()=>{const db=await freshDb();const T=await tenant(db,'Agent Brief');const n1=await T.mk('nurse','Nurse B'),doc=await T.mk('doctor','Dr Agent'),rec=await T.mk('reception','Rec B')
 await saveShifts(db,T.admin,n1.userId,week([0,1,2,3,4,5,6],'00:00','23:59','General'))
 const b=await runAgent(db,T.admin,'staff_brief');assert.match(b!.summary,/staff rostered/);assert.ok(b!.findings.some((f:any)=>/not logged in/.test(f.text)),b!.findings.map((f:any)=>f.text).join('|'))
 const s=await runScheduledAgents(db,new Date('2026-11-13T02:00:00Z'));assert.ok(s.agentRuns>=3,'brief + pharmacy + roster on Friday');assert.equal(s.agentFailed,0)
 await saveAgentSettings(db,T.admin,{enabled:{staff_brief:false}});const runs0=(await db.query("select count(*)::int n from agent_runs where agent='staff_brief'")).rows[0].n;await runScheduledAgents(db,new Date('2026-11-14T02:00:00Z'));assert.equal((await db.query("select count(*)::int n from agent_runs where agent='staff_brief'")).rows[0].n,runs0,'switched off')
 const p=await registerPatient(db,rec,{fullName:'Agent Patient',mobile:'9876501234',gender:'Male',dateOfBirth:'1980-01-01'});const bed=await addBed(db,T.admin,{ward:'General',bedNo:'A1',dailyRate:1000});const a=await admit(db,rec,{patientId:p.id,doctorId:doc.userId,bedId:bed.id,reason:'Pneumonia'})
 await db.query("insert into diagnostic_orders(hospital_id,patient_id,test_name,category,ordered_by) values($1,$2,'Chest X-ray','radiology',$3)",[T.h.hospitalId,p.id,doc.userId])
 const d=await runAgent(db,doc,'discharge',{admissionId:a.id});assert.ok(d!.findings.some((f:any)=>/Chest X-ray/.test(f.text)));assert.match(d!.data.draft.summary,/Pneumonia/);assert.equal(d!.data.draft.aiUsed,false)
 await assert.rejects(runAgent(db,rec,'discharge',{admissionId:a.id}),/admin \/ doctor/)
 assert.equal(toolsFor(n1).length,0);assert.ok(toolsFor(T.admin).some(t=>t.name==='run_agent'))
 await assert.rejects(askAgents(db,T.admin,'How many nurses?'),/switched off|configured|plan/i)
 await db.query('update hospitals set ai_enabled=true where id=$1',[T.h.hospitalId]);Object.assign(process.env,{LLM_API_URL:'https://llm.test/v1',LLM_API_KEY:'k',LLM_MODEL:'m'})
 let n=0;const bodies:any[]=[];__setLlmFetch((async(_u:any,init:any)=>{bodies.push(JSON.parse(init.body));n++;const msg=n===1?{content:null,tool_calls:[{id:'c1',type:'function',function:{name:'staff_today',arguments:'{}'}},{id:'c2',type:'function',function:{name:'not_a_tool',arguments:'{}'}}]}:{content:'1 nurse is rostered today.'};return {ok:true,json:async()=>({choices:[{message:msg}],usage:{total_tokens:50},model:'m'})}}) as any)
 try{const r=await askAgents(db,T.admin,'How many nurses today?');assert.equal(r.answer,'1 nurse is rostered today.');assert.deepEqual(r.steps.map((x:any)=>[x.tool,x.ok]),[['staff_today',true],['not_a_tool',false]])
  assert.ok(bodies[0].tools.length>3);assert.equal(bodies[1].messages.filter((m:any)=>m.role==='tool').length,2);assert.ok(!JSON.stringify(bodies[1]).includes('Agent Patient'),'no patient data sent')
  const u=(await db.query('select tokens from ai_usage where hospital_id=$1',[T.h.hospitalId])).rows[0];assert.ok(u.tokens>=100)}
 finally{__setLlmFetch(null);for(const k of ['LLM_API_URL','LLM_API_KEY','LLM_MODEL'])delete process.env[k]}})
