import {Pool} from 'pg'
const globalForDb=globalThis as unknown as {hmsPool?:Pool}
function createPool(){const connectionString=process.env.DATABASE_URL?.trim();if(!connectionString)throw new Error('DATABASE_URL_MISSING');return new Pool({connectionString,max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:10000})}
export function getDb(){if(!globalForDb.hmsPool)globalForDb.hmsPool=createPool();return globalForDb.hmsPool}
