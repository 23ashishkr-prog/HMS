-- 003: additional staff roles (master data).
alter type hms_role add value if not exists 'nurse';
alter type hms_role add value if not exists 'billing';
