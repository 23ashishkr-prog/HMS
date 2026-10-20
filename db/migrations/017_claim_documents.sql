-- Insurance: per-claim document checklist (manual ticks; system-available docs auto-detected at read time)
alter table insurance_claims add column if not exists documents jsonb not null default '{}';
