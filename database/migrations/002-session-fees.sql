-- Adds the exit fee and payment status to an existing parking_sessions table (FR-09, FR-10).
-- Run once per existing database. A fresh `db:reset` already includes these columns.
ALTER TABLE parking_sessions
  ADD COLUMN fee_amount INT UNSIGNED NULL AFTER exit_time,
  ADD COLUMN billed_minutes INT UNSIGNED NULL AFTER fee_amount,
  ADD COLUMN payment_status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid' AFTER status;