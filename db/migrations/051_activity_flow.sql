-- "Who is using the system": last request time per user (written at most every 5 minutes), for the staff board.
alter table users add column if not exists last_seen_at timestamptz;
-- Patient-flow dashboard reads these by hospital and time.
create index if not exists idx_queue_hosp_checkin on doctor_queue(hospital_id,checked_in_at);
create index if not exists idx_orders_hosp_ordered on diagnostic_orders(hospital_id,ordered_at);
create index if not exists idx_rx_hosp_created on prescriptions(hospital_id,created_at);
