-- Product on inbound leads so the platform dashboard can show Hospital cloud, TailDesk, or other.
alter table saas_leads add column if not exists product text not null default 'hospital_cloud';
create index if not exists saas_leads_email_created_idx on saas_leads (lower(email), created_at desc);
