-- One-time local setup: creates the dev and test databases and the app's MySQL user.
-- Run as root from the repository root:
--   mysql -u root -p < database/setup-dev.sql
--
-- The password below is a local development value only (MySQL is not reachable from
-- the network). It must match DB_PASSWORD in server/.env.

CREATE DATABASE IF NOT EXISTS parking_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS parking_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'parking_app'@'localhost' IDENTIFIED BY 'parking_dev_pw';
CREATE USER IF NOT EXISTS 'parking_app'@'127.0.0.1' IDENTIFIED BY 'parking_dev_pw';

GRANT ALL PRIVILEGES ON parking_dev.* TO 'parking_app'@'localhost', 'parking_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON parking_test.* TO 'parking_app'@'localhost', 'parking_app'@'127.0.0.1';

FLUSH PRIVILEGES;
