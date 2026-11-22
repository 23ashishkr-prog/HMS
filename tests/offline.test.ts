import {test} from 'node:test';import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import {enqueueOffline,listQueue,syncQueue,isNetworkError,removeQueued,ref,resolveRefs} from '../lib/offline'
test('offline queue: ordered replay with stable Idempotency-Key, 4xx → failed, 401/5xx/network stop and keep pending',async()=>{
 const a=await enqueueOffline('/api/frontdesk','POST',{n:1},'A'),b=await enqueueOffline('/api/frontdesk','POST',{n:2},'B'),c=await enqueueOffline('/api/frontdesk','POST',{n:3},'C')
 assert.equal((await listQueue()).length,3)
 const seen:string[]=[];let mode='net'
 const f=(async(url:string,init:any)=>{seen.push(init.headers['Idempotency-Key']);const n=JSON.parse(init.body).n
  if(mode==='net')throw new TypeError('Failed to fetch');if(mode==='401')return new Response('{}',{status:401});if(n===2)return new Response(JSON.stringify({error:'Possible duplicate patient'}),{status:409});return new Response(JSON.stringify({token:{token_no:n}}),{status:200})}) as any
 let r=await syncQueue(f);assert.deepEqual([r.done,r.failed,r.left],[0,0,3])
 mode='401';r=await syncQueue(f);assert.equal(r.needLogin,true);assert.equal(r.left,3)
 mode='ok';r=await syncQueue(f);assert.deepEqual([r.done,r.failed,r.left],[2,1,0])
 const q=await listQueue();assert.equal(q.find(x=>x.id===b.id)!.status,'failed');assert.match(q.find(x=>x.id===b.id)!.error!,/duplicate/);assert.equal(q.find(x=>x.id===c.id)!.result.token.token_no,3)
 // the same key is used on every retry of the same item
 assert.equal(seen.filter(k=>k===a.key).length,3);assert.notEqual(a.key,b.key)
 r=await syncQueue(f);assert.equal(r.done,0) // nothing re-sent
 assert.equal(isNetworkError(new TypeError('Failed to fetch')),true);assert.equal(isNetworkError(new Error('Patient not found')),false)})

test('offline queue: plan on hold / read-only stops replay and keeps everything',async()=>{
 for(const q of await listQueue())await removeQueued(q.id)
 await enqueueOffline('/api/invoices/x','POST',{action:'payment'},'Pay');await enqueueOffline('/api/invoices/y','POST',{action:'payment'},'Pay 2')
 for(const res of [new Response('{"error":"on hold","onHold":true}',{status:402}),new Response('{"error":"read only","readOnly":true}',{status:403})]){
  const r=await syncQueue((async()=>res.clone()) as any);assert.equal(r.locked,true);assert.equal(r.left,2)}
 for(const q of await listQueue())await removeQueued(q.id)})

test('offline queue: a later step uses the result of an earlier one; if the earlier fails, the later is kept, never sent blind',async()=>{
 const open=await enqueueOffline('/api/encounters','POST',{queueId:'q1'},'Open visit')
 const fin=await enqueueOffline('/api/encounters/'+ref(open.id,'encounter.id'),'POST',{action:'finish',note:'x'},'Finish visit')
 const urls:string[]=[]
 const f=(async(url:string)=>{urls.push(url);return new Response(JSON.stringify(url.endsWith('/api/encounters')?{encounter:{id:'enc-42'}}:{ok:true}),{status:200})}) as any
 const r=await syncQueue(f);assert.equal(r.done,2)
 assert.match(urls[1],/\/api\/encounters\/enc-42$/)
 assert.equal((await listQueue()).find(q=>q.id===fin.id)!.status,'done')
 for(const q of await listQueue())await removeQueued(q.id)
 const bill=await enqueueOffline('/api/billing/pending','POST',{patientId:'p1'},'Bill')
 const pay=await enqueueOffline('/api/invoices/'+ref(bill.id,'invoiceId'),'POST',{action:'payment'},'Pay')
 const sent:string[]=[]
 const g=(async(url:string)=>{sent.push(url);return new Response('{"error":"Nothing to bill"}',{status:409})}) as any
 const r2=await syncQueue(g);assert.equal(r2.failed,2);assert.equal(sent.length,1) // the payment was not sent
 const kept=(await listQueue()).find(q=>q.id===pay.id)!;assert.equal(kept.status,'failed');assert.match(kept.error!,/earlier step/)
 assert.equal(resolveRefs(kept,await listQueue()).hasOwnProperty('missing'),true)})
