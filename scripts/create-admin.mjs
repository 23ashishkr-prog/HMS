// Creates the hospital and its first admin from environment variables (no demo users/patients).
// Usage: DATABASE_URL=... HOSPITAL_NAME="..." HOSPITAL_CODE=ABC ADMIN_EMAIL=... ADMIN_NAME="..." ADMIN_PASSWORD=... node scripts/create-admin.mjs
import pg from 'pg';
const {DATABASE_URL,HOSPITAL_NAME,HOSPITAL_CODE,ADMIN_EMAIL,ADMIN_NAME,ADMIN_PASSWORD}=process.env;
if(!DATABASE_URL||!HOSPITAL_NAME||!HOSPITAL_CODE||!ADMIN_EMAIL||!ADMIN_PASSWORD){console.error('Required: DATABASE_URL HOSPITAL_NAME HOSPITAL_CODE ADMIN_EMAIL ADMIN_PASSWORD (ADMIN_NAME optional)');process.exit(1)}
if(ADMIN_PASSWORD.length<10){console.error('ADMIN_PASSWORD must be at least 10 characters');process.exit(1)}
const c=new pg.Client({connectionString:DATABASE_URL});await c.connect();
try{const h=await c.query('insert into hospitals(name,code) values($1,$2) on conflict(code) do update set name=excluded.name returning id',[HOSPITAL_NAME,HOSPITAL_CODE.toUpperCase()]);
await c.query("insert into users(hospital_id,email,full_name,role,password_hash,must_change_password) values($1,lower($2),$3,'admin',crypt($4,gen_salt('bf',12)),true) on conflict(hospital_id,email) do nothing",[h.rows[0].id,ADMIN_EMAIL.trim(),ADMIN_NAME||'Administrator',ADMIN_PASSWORD]);
console.log('hospital',HOSPITAL_CODE.toUpperCase(),'admin',ADMIN_EMAIL,'ready')}finally{await c.end()}
