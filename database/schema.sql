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
