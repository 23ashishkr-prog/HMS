-- Per-user appearance (theme, accent, density, font size) and hospital-wide defaults.
alter table users add column if not exists appearance jsonb not null default '{}';
alter table hospitals add column if not exists ui_defaults jsonb not null default '{}';
