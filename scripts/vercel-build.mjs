// Vercel build: optionally run migrations (RUN_MIGRATIONS=true), then next build.
import {execSync} from 'node:child_process'
if(process.env.RUN_MIGRATIONS==='true'&&process.env.DATABASE_URL)execSync('node scripts/migrate.mjs',{stdio:'inherit'})
execSync('npx next build',{stdio:'inherit'})
