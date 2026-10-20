-- 005: link invoice lines to their source (visit token / diagnostic order) so auto-billing never double-bills.
alter table invoice_items add column if not exists source_type text;
alter table invoice_items add column if not exists source_id uuid;
create unique index if not exists idx_invoice_item_source on invoice_items(source_type,source_id) where source_id is not null;
