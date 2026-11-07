-- Language and the one-time first-login tour, remembered per person.
alter table users add column if not exists locale text not null default 'en';
alter table users add column if not exists tour_seen_at timestamptz;
