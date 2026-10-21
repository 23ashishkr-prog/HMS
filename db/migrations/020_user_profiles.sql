-- Staff profile details managed by the hospital admin.
alter table users add column if not exists phone text;
alter table users add column if not exists department text;
alter table users add column if not exists designation text;
alter table users add column if not exists registration_no text;
alter table users add column if not exists photo_url text;
