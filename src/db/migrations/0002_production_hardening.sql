ALTER TABLE staff_users
  ADD COLUMN password_changed_at TIMESTAMP NULL AFTER is_active;

ALTER TABLE staff_users
  ADD COLUMN last_login_at TIMESTAMP NULL AFTER password_changed_at;

ALTER TABLE staff_users
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE members
  ADD UNIQUE KEY uk_member_phone (phone),
  ADD UNIQUE KEY uk_member_email (email);

CREATE TABLE IF NOT EXISTS member_accounts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  activated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL,
  password_changed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_member_account_member (member_id)
);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key VARCHAR(255) NOT NULL PRIMARY KEY,
  count INT NOT NULL,
  reset_at_ms BIGINT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_staff_id BIGINT NULL,
  actor_member_id BIGINT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NULL,
  ip_address VARCHAR(64) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_created (created_at),
  KEY idx_audit_staff (actor_staff_id),
  KEY idx_audit_member (actor_member_id),
  KEY idx_audit_entity (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS trainers (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  specialty VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_trainers_active (is_active)
);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  trainer_id BIGINT NULL,
  session_type VARCHAR(100) NOT NULL,
  scheduled_at TIMESTAMP NOT NULL,
  status ENUM('Booked', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Booked',
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_bookings_member (member_id),
  KEY idx_bookings_trainer (trainer_id),
  KEY idx_bookings_schedule (scheduled_at),
  KEY idx_bookings_status (status)
);

CREATE TABLE IF NOT EXISTS member_requests (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  request_type ENUM('freeze', 'renew', 'upgrade') NOT NULL,
  requested_package VARCHAR(100) NULL,
  status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  resolved_by_staff_id BIGINT NULL,
  KEY idx_requests_member_status (member_id, status),
  KEY idx_requests_status_time (status, created_at)
);

CREATE TABLE IF NOT EXISTS progress_entries (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  weight_kg_x100 INT NULL,
  body_fat_pct_x100 INT NULL,
  muscle_mass_kg_x100 INT NULL,
  notes VARCHAR(500) NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_progress_member_time (member_id, recorded_at)
);

CREATE TABLE IF NOT EXISTS workout_plans (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  trainer_id BIGINT NULL,
  title VARCHAR(255) NOT NULL,
  plan JSON NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_workout_member_active (member_id, is_active)
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
