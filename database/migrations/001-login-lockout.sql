-- Adds login-lockout tracking to an existing users table (NFR-13).
-- Run once per existing database. A fresh `db:reset` already includes these columns.
ALTER TABLE users
  ADD COLUMN failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER password_hash,
  ADD COLUMN locked_until DATETIME NULL AFTER failed_login_attempts;