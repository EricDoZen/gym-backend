ALTER TABLE staff_users
  MODIFY COLUMN role ENUM('owner','manager','reception','trainer','accountant') NOT NULL;

CREATE TABLE IF NOT EXISTS payment_adjustments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT NOT NULL,
  adjustment_type ENUM('refund','void') NOT NULL,
  amount_mmk BIGINT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_by_staff_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_payment_adjustments_payment (payment_id),
  KEY idx_payment_adjustments_created_by (created_by_staff_id)
);

ALTER TABLE bookings
  MODIFY COLUMN status ENUM('Booked','Completed','Cancelled','NoShow') NOT NULL DEFAULT 'Booked';

ALTER TABLE bookings
  ADD COLUMN completed_at TIMESTAMP NULL AFTER status;

CREATE TABLE IF NOT EXISTS trainer_weekly_availability (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trainer_id BIGINT NOT NULL,
  weekday TINYINT NOT NULL,
  start_minute INT NOT NULL,
  end_minute INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_trainer_availability_slot (trainer_id, weekday, start_minute, end_minute),
  KEY idx_trainer_availability_trainer (trainer_id)
);

CREATE TABLE IF NOT EXISTS trainer_time_off (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trainer_id BIGINT NOT NULL,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_trainer_time_off_trainer_time (trainer_id, starts_at, ends_at)
);

CREATE TABLE IF NOT EXISTS member_notes (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  created_by_staff_id BIGINT NOT NULL,
  note VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_member_notes_member_time (member_id, created_at)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recipient_type ENUM('staff','member') NOT NULL,
  recipient_id BIGINT NULL,
  event_type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  channel ENUM('internal','email','sms','telegram','viber') NOT NULL DEFAULT 'internal',
  status ENUM('Pending','Sent','Failed','Read') NOT NULL DEFAULT 'Pending',
  scheduled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL,
  read_at TIMESTAMP NULL,
  attempts INT NOT NULL DEFAULT 0,
  failure_reason VARCHAR(500) NULL,
  dedupe_key VARCHAR(191) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_notifications_dedupe (dedupe_key),
  KEY idx_notifications_recipient (recipient_type, recipient_id, status),
  KEY idx_notifications_schedule (status, scheduled_at)
);
