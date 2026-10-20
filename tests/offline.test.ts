import {test} from 'node:test';import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import {enqueueOffline,listQueue,syncQueue,isNetworkError} from '../lib/offline'
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
