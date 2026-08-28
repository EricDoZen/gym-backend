ALTER TABLE staff_users
  ADD COLUMN token_version INT NOT NULL DEFAULT 0 AFTER last_login_at;

ALTER TABLE member_accounts
  ADD COLUMN token_version INT NOT NULL DEFAULT 0 AFTER last_login_at;

ALTER TABLE payments
  ADD COLUMN membership_action VARCHAR(20) NULL AFTER idempotency_key;

ALTER TABLE member_requests
  ADD COLUMN pending_key VARCHAR(100) NULL AFTER status;

UPDATE member_requests
SET pending_key = CONCAT(member_id, ':', request_type)
WHERE status = 'Pending' AND pending_key IS NULL;

ALTER TABLE member_requests
  ADD UNIQUE KEY uk_member_requests_pending (pending_key);
