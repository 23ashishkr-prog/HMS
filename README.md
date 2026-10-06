# Aegis HMS — Patient Next Step

Next.js HMS foundation using Supabase/Postgres, tenant-isolated patient data, Patient 360 workflow, next-step tracking, and WhatsApp Cloud API messaging.

## Run
1. `npm install`
2. Copy `.env.example` to `.env.local` and add your Supabase + WhatsApp credentials.
3. Apply `supabase/migrations/001_hms_core.sql` to a dedicated Supabase project.
4. `npm run dev`

The dashboard currently includes realistic demo rows so the UI can be reviewed before a live database is attached. The schema is ready for replacing those rows with Supabase queries.

## WhatsApp
The API route `/api/whatsapp/send` sends a text message through Meta WhatsApp Cloud API. For production healthcare use, obtain patient consent, use approved templates when required by WhatsApp policy, avoid unnecessary medical detail, and log provider message IDs/delivery status in `patient_communications`.
