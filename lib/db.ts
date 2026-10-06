import {Pool} from 'pg'
const globalForDb=globalThis as unknown as {hmsPool?:Pool}
export const db=globalForDb.hmsPool??new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:5})
if(process.env.NODE_ENV!=='production')globalForDb.hmsPool=db
