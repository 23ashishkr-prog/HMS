// Vercel build: apply idempotent migrations automatically on production builds
// (VERCEL_ENV=production) or when RUN_MIGRATIONS=true, using DATABASE_URL; then next build.
// Preview builds do NOT migrate unless RUN_MIGRATIONS=true, so previews never alter the live DB.
import {execSync} from 'node:child_process'
const want=process.env.VERCEL_ENV==='production'||process.env.RUN_MIGRATIONS==='true'
if(want&&process.env.DATABASE_URL)execSync('node scripts/migrate.mjs',{stdio:'inherit'})
else if(want)console.warn('DATABASE_URL missing: skipping migrations')
execSync('npx next build',{stdio:'inherit'})
