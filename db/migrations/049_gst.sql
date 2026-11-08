-- GST: HSN/SAC and rate on medicines and services, carried onto every bill line; buyer GSTIN for business bills (e-invoice),
-- the IRN once the bill is registered on the e-invoice portal, and the hospital's address details e-invoices need.
alter table medicines add column if not exists hsn_code text not null default '3004';
alter table medicines add column if not exists gst_rate numeric(5,2) not null default 5;
alter table service_catalog add column if not exists sac_code text not null default '9993';
alter table service_catalog add column if not exists gst_rate numeric(5,2) not null default 0;
alter table invoice_items add column if not exists hsn_sac text;
alter table invoice_items add column if not exists gst_rate numeric(5,2);
alter table invoices add column if not exists buyer_gstin text;
alter table invoices add column if not exists buyer_name text;
alter table invoices add column if not exists buyer_address text;
alter table invoices add column if not exists buyer_pincode text;
alter table invoices add column if not exists irn text;
alter table invoices add column if not exists irn_ack_no text;
alter table invoices add column if not exists irn_ack_date timestamptz;
alter table hospitals add column if not exists legal_name text;
alter table hospitals add column if not exists city text;
alter table hospitals add column if not exists pincode text;

-- Every bill line gets its HSN/SAC and GST rate from where it came from: a dispensed medicine, or a service. Others: 0%.
create or replace function invoice_item_gst() returns trigger language plpgsql as $$
begin
 if new.gst_rate is null then
  if new.source_type='dispense' and new.source_id is not null then
   select m.gst_rate,m.hsn_code into new.gst_rate,new.hsn_sac from dispensed_items d join medicines m on m.id=d.medicine_id where d.id=new.source_id;
  elsif new.service_id is not null then
   select s.gst_rate,s.sac_code into new.gst_rate,new.hsn_sac from service_catalog s where s.id=new.service_id;
  end if;
  if new.gst_rate is null then new.gst_rate:=0; end if;
 end if;
 return new;
end $$;
drop trigger if exists trg_invoice_item_gst on invoice_items;
create trigger trg_invoice_item_gst before insert on invoice_items for each row execute function invoice_item_gst();
-- Existing lines: same rule.
update invoice_items i set gst_rate=m.gst_rate,hsn_sac=m.hsn_code from dispensed_items d join medicines m on m.id=d.medicine_id where i.gst_rate is null and i.source_type='dispense' and d.id=i.source_id;
update invoice_items i set gst_rate=s.gst_rate,hsn_sac=s.sac_code from service_catalog s where i.gst_rate is null and s.id=i.service_id;
update invoice_items set gst_rate=0 where gst_rate is null;
