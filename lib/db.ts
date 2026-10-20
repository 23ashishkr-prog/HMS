import {Pool} from 'pg'
const globalForDb=globalThis as unknown as {hmsPool?:Pool}
/** Errors worth one more try: serialization/deadlock, admin shutdown, connection drops (Neon/Supabase cold starts). */
export const TRANSIENT=new Set(['40001','40P01','57P01','57P02','57P03','08000','08003','08006','08001','53300'])
export function isTransient(e:any){return TRANSIENT.has(e?.code)||/ECONNRESET|ETIMEDOUT|EPIPE|Connection terminated|timeout exceeded when trying to connect/i.test(String(e?.message||''))}
/** Retry a single autocommit statement up to 3 times with backoff. Multi-statement work uses tx() and is retried as a whole only by idempotent callers. */
export async function withRetry<T>(fn:()=>Promise<T>,tries=3):Promise<T>{let last:any;for(let i=0;i<tries;i++){try{return await fn()}catch(e){last=e;if(!isTransient(e)||i===tries-1)throw e;await new Promise(r=>setTimeout(r,100*2**i+Math.random()*50))}}throw last}
function createPool(){const connectionString=process.env.DATABASE_URL?.trim();if(!connectionString)throw new Error('DATABASE_URL_MISSING');const pool=new Pool({connectionString,max:Number(process.env.DB_POOL_MAX||5),idleTimeoutMillis:30000,connectionTimeoutMillis:10000})
 pool.on('error',()=>{}) // idle client errors must not crash the function; next query reconnects
 const q=pool.query.bind(pool) as any;(pool as any).query=(...a:any[])=>withRetry(()=>q(...a));return pool}
export function getDb(){if(!globalForDb.hmsPool)globalForDb.hmsPool=createPool();return globalForDb.hmsPool}
