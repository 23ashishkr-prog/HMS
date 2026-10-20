-- 006: deactivate legacy demo logins from the removed db/bootstrap.sql (shared password).
-- Deactivation only. No rows are deleted, so any real data they created is kept.
update users set active=false,updated_at=now() where lower(email) like '%@aegishms.test' and active;
