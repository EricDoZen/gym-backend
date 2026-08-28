ALTER TABLE payments
  ADD COLUMN payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash' AFTER status;

ALTER TABLE payments
  ADD COLUMN reference_no VARCHAR(100) NULL AFTER payment_method;

ALTER TABLE payments
  ADD COLUMN receipt_no VARCHAR(50) NULL AFTER reference_no;

ALTER TABLE payments
  ADD COLUMN idempotency_key VARCHAR(100) NULL AFTER receipt_no;

ALTER TABLE payments
  ADD COLUMN created_by_staff_id BIGINT NULL AFTER payment_date;

ALTER TABLE payments
  ADD UNIQUE KEY uk_payments_idempotency (idempotency_key),
  ADD UNIQUE KEY uk_payments_receipt (receipt_no),
  ADD KEY idx_payments_member_date (member_id, payment_date);

ALTER TABLE bookings
  ADD COLUMN duration_minutes INT NOT NULL DEFAULT 60 AFTER scheduled_at;

CREATE TABLE IF NOT EXISTS member_trainer_assignments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT NOT NULL,
  trainer_id BIGINT NOT NULL,
  assigned_by_staff_id BIGINT NOT NULL,
  notes VARCHAR(500) NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_member_trainer_assignment (member_id),
  KEY idx_member_trainer_trainer (trainer_id)
);
