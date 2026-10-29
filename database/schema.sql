-- Vehicle Parking Management and Tracking System: table definitions.
-- Apply with `npm run db:init` (keeps data) or `npm run db:reset` (drops all tables first).
-- Add each module's tables in its own section, in dependency order.

-- ---------------------------------------------------------------------------
-- Users module (FR-01, NFR-10 to NFR-14)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name                  VARCHAR(100)  NOT NULL,
  email                 VARCHAR(254)  NOT NULL,
  password_hash         CHAR(60)      NOT NULL,
  failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until          DATETIME      NULL,
  role                  ENUM('driver', 'attendant', 'admin') NOT NULL DEFAULT 'driver',
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
);

-- One row per logged-in browser. Only a SHA-256 hash of the session token is stored,
-- so a leaked table cannot be used to hijack sessions.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  token_hash   CHAR(64)     NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_sessions_token (token_hash),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);


-- ---------------------------------------------------------------------------
-- Audit log module (NFR-16, NFR-17)
-- ---------------------------------------------------------------------------

-- One row per important administrator action, written after the action succeeds.
-- The admin's name and email are copied in, so the trail still reads correctly after
-- that account is removed (admin_id then becomes NULL).
CREATE TABLE IF NOT EXISTS audit_log (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id    INT UNSIGNED NULL,
  admin_name  VARCHAR(100) NOT NULL,
  admin_email VARCHAR(254) NOT NULL,
  action      VARCHAR(40)  NOT NULL,
  summary     VARCHAR(500) NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_log_created (created_at),
  KEY idx_audit_log_action (action),
  CONSTRAINT fk_audit_log_admin FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE SET NULL
);


-- ---------------------------------------------------------------------
-- Vehicles module (FR-02)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vehicles (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    registration_number VARCHAR(20) NOT NULL,
    type VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    colour VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_vehicles_registration_number (registration_number),
    CONSTRAINT fk_vehicles_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
);


-- ---------------------------------------------------------------------------
-- Slots module (FR-12, UC-12)
-- ---------------------------------------------------------------------------

-- A slot is never deleted, only disabled, so past parking sessions keep their slot.
-- Occupied and Reserved are worked out from sessions and reservations (FR-05, FR-04);
-- only the admin's Unavailable switch is stored here.
CREATE TABLE IF NOT EXISTS parking_slots (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(10)  NOT NULL,
  slot_type   ENUM('two_wheeler', 'four_wheeler') NOT NULL,
  is_disabled BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_parking_slots_code (code)
);


-- Reservations module (FR-04)
CREATE TABLE IF NOT EXISTS reservations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    vehicle_id INT UNSIGNED NOT NULL,
    slot_id INT UNSIGNED NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    status ENUM('reserved', 'cancelled', 'completed') NOT NULL DEFAULT 'reserved',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_reservations_slot_window (slot_id, start_time, end_time, status),
    KEY idx_reservations_user (user_id),
    CONSTRAINT fk_reservations_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_reservations_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    CONSTRAINT fk_reservations_slot
        FOREIGN KEY (slot_id) REFERENCES parking_slots(id) ON DELETE RESTRICT,
    CONSTRAINT chk_reservations_time
        CHECK (end_time > start_time)
);


-- ---------------------------------------------------------------------------
-- Parking sessions module (shared by FR-06 assignment and FR-07 vehicle entry)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS parking_sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_id INT UNSIGNED NOT NULL,
  slot_id INT UNSIGNED NOT NULL,
  entry_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exit_time DATETIME NULL,
  fee_amount INT UNSIGNED NULL,
  billed_minutes INT UNSIGNED NULL,
  status ENUM('active', 'completed') NOT NULL DEFAULT 'active',
  payment_status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_parking_sessions_slot_status (slot_id, status),
  KEY idx_parking_sessions_vehicle_status (vehicle_id, status),
  CONSTRAINT fk_parking_sessions_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_parking_sessions_slot
    FOREIGN KEY (slot_id) REFERENCES parking_slots(id) ON DELETE RESTRICT,
  CONSTRAINT chk_parking_sessions_exit_time
    CHECK (exit_time IS NULL OR exit_time >= entry_time)
);

-- FR-10 / SYS-13: every payment attempt for a completed session, paid or failed.
-- Only the last 4 digits of a card are kept; never the full number or expiry (NFR-18).
CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id INT UNSIGNED NOT NULL,
  amount INT UNSIGNED NOT NULL,
  method ENUM('cash', 'upi', 'card') NOT NULL,
  status ENUM('paid', 'failed') NOT NULL,
  card_last4 CHAR(4) NULL,
  recorded_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payments_session (session_id),
  CONSTRAINT fk_payments_session FOREIGN KEY (session_id) REFERENCES parking_sessions (id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_user FOREIGN KEY (recorded_by) REFERENCES users (id) ON DELETE RESTRICT
);


-- ---------------------------------------------------------------------------
-- Rates module (FR-12, FR-09)
-- ---------------------------------------------------------------------------

-- One rate per slot type, set by the administrator. Amounts are whole rupees.
-- Time is billed in steps of billing_step_minutes, rounded up (UC-09 rounding rule).
CREATE TABLE IF NOT EXISTS parking_rates (
  slot_type            ENUM('two_wheeler', 'four_wheeler') NOT NULL,
  hourly_rate          INT UNSIGNED      NOT NULL,
  minimum_fee          INT UNSIGNED      NOT NULL,
  billing_step_minutes SMALLINT UNSIGNED NOT NULL,
  updated_by           INT UNSIGNED      NULL,
  updated_at           TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (slot_type),
  CONSTRAINT fk_parking_rates_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
);

-- Starting rates, so fees work before an administrator changes anything.
-- INSERT IGNORE keeps rates an administrator has already set.
INSERT IGNORE INTO parking_rates (slot_type, hourly_rate, minimum_fee, billing_step_minutes) VALUES
  ('four_wheeler', 20, 10, 15),
  ('two_wheeler', 10, 5, 15);