alter table users add column if not exists home_layout jsonb;
alter table hospitals add column if not exists home_layouts jsonb not null default '{}';
