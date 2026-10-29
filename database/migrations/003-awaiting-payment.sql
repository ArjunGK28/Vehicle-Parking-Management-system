-- Adds the awaiting_payment session status (UC-08: the session completes only once paid).
-- Run once per existing database. A fresh `db:reset` already includes it.
-- Sessions completed before this change keep their status, so their slots stay free.
ALTER TABLE parking_sessions
  MODIFY COLUMN status ENUM('active', 'awaiting_payment', 'completed') NOT NULL DEFAULT 'active';
