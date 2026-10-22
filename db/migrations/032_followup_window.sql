-- 032: free follow-up window + duplicate consultation-line review (non-destructive)
alter table hospitals add column if not exists followup_free_days int not null default 7;
alter table doctor_queue add column if not exists covered_by_invoice_id uuid references invoices(id) on delete set null;
alter table doctor_queue add column if not exists covered_until date;
alter table invoice_items add column if not exists review_flag text;
-- Flag (never delete) consultation lines that the new rule would not have charged: a later visit to the same doctor
-- within 7 days of an earlier billed consultation for the same patient. Paid money records are untouched.
update invoice_items i set review_flag='repeat_consult_within_7d'
 from doctor_queue q, invoices inv
 where i.source_type='visit' and i.source_id=q.id and inv.id=i.invoice_id and inv.status<>'cancelled' and i.review_flag is null
   and exists(select 1 from invoice_items i2 join doctor_queue q2 on q2.id=i2.source_id join invoices inv2 on inv2.id=i2.invoice_id
              where i2.source_type='visit' and i2.id<>i.id and inv2.status<>'cancelled' and q2.patient_id=q.patient_id and q2.doctor_user_id=q.doctor_user_id
                and q2.hospital_id=q.hospital_id and (q2.visit_date<q.visit_date or (q2.visit_date=q.visit_date and q2.checked_in_at<q.checked_in_at))
                and q2.visit_date>=q.visit_date-7);
