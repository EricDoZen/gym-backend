CREATE DATABASE IF NOT EXISTS elite_gym;

USE elite_gym;

CREATE TABLE IF NOT EXISTS staff_users (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('owner', 'reception') NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_staff_email (email)
);

CREATE TABLE IF NOT EXISTS membership_packages (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  price_mmk BIGINT NOT NULL,
  duration_days INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uk_package_code (code)
);

CREATE TABLE IF NOT EXISTS members (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  member_code VARCHAR(20) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(255) NULL,
  package_id BIGINT NULL,
  package_name VARCHAR(100) NOT NULL,
  status ENUM('Active', 'Expired', 'Trial', 'Frozen') NOT NULL DEFAULT 'Trial',
  join_date DATE NOT NULL,
  expire_date DATE NOT NULL,
  attendance_count INT NOT NULL DEFAULT 0,
  avatar_url VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_member_code (member_code),
  KEY idx_members_name (full_name),
  KEY idx_members_phone (phone),
  KEY idx_members_status (status)
);

CREATE TABLE IF NOT EXISTS trial_registrations (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(255) NULL,
  package_code VARCHAR(50) NOT NULL,
  preferred_start_date DATE NULL,
  converted_member_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_trials_phone (phone)
);

CREATE TABLE IF NOT EXISTS checkins (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  member_id BIGINT NOT NULL,
  membership_type VARCHAR(100) NOT NULL,
  checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_checkins_member (member_id),
  KEY idx_checkins_time (checked_in_at)
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  member_id BIGINT NOT NULL,
  package_name VARCHAR(100) NOT NULL,
  amount_mmk BIGINT NOT NULL,
  status ENUM('Paid', 'Pending', 'Overdue') NOT NULL,
  payment_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_payments_status (status),
  KEY idx_payments_date (payment_date)
);

CREATE TABLE IF NOT EXISTS membership_actions (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  member_id BIGINT NOT NULL,
  action ENUM('freeze', 'renew', 'upgrade', 'booking') NOT NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_actions_member (member_id)
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  payload JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
