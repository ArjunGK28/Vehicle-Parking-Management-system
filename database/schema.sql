-- Vehicle Parking Management and Tracking System: table definitions.
-- Apply with `npm run db:init` (keeps data) or `npm run db:reset` (drops all tables first).
-- Add each module's tables in its own section, in dependency order.

-- ---------------------------------------------------------------------------
-- Users module (FR-01, NFR-10 to NFR-14)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100)  NOT NULL,
  email         VARCHAR(254)  NOT NULL,
  password_hash CHAR(60)      NOT NULL,
  role          ENUM('driver', 'attendant', 'admin') NOT NULL DEFAULT 'driver',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
);
