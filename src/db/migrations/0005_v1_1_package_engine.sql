ALTER TABLE membership_packages
  ADD COLUMN description VARCHAR(500) NULL AFTER name;

ALTER TABLE membership_packages
  ADD COLUMN freeze_allowance_days INT NOT NULL DEFAULT 0 AFTER duration_days;

ALTER TABLE membership_packages
  ADD COLUMN session_limit INT NULL AFTER freeze_allowance_days;

ALTER TABLE membership_packages
  ADD COLUMN renewal_window_days INT NOT NULL DEFAULT 30 AFTER session_limit;

ALTER TABLE membership_packages
  ADD COLUMN allow_upgrade BOOLEAN NOT NULL DEFAULT TRUE AFTER renewal_window_days;

ALTER TABLE membership_packages
  ADD COLUMN allow_downgrade BOOLEAN NOT NULL DEFAULT TRUE AFTER allow_upgrade;

ALTER TABLE membership_packages
  ADD COLUMN effective_from DATE NULL AFTER allow_downgrade;

ALTER TABLE membership_packages
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER effective_from;

ALTER TABLE membership_packages
  ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER sort_order;

ALTER TABLE membership_packages
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

CREATE TABLE IF NOT EXISTS membership_package_price_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  package_id BIGINT NOT NULL,
  price_mmk BIGINT NOT NULL,
  effective_from DATE NOT NULL,
  created_by_staff_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_package_price_history_package_date (package_id, effective_from)
);

INSERT INTO membership_package_price_history (package_id, price_mmk, effective_from, created_by_staff_id)
SELECT p.id, p.price_mmk, COALESCE(p.effective_from, CURDATE()), NULL
FROM membership_packages p
WHERE NOT EXISTS (
  SELECT 1 FROM membership_package_price_history h WHERE h.package_id = p.id
);

ALTER TABLE payments
  ADD COLUMN package_id BIGINT NULL AFTER member_id;

ALTER TABLE payments
  ADD COLUMN package_code VARCHAR(50) NULL AFTER package_id;

ALTER TABLE payments
  ADD COLUMN package_price_mmk BIGINT NULL AFTER package_name;

UPDATE payments p
SET
  package_id = (
    SELECT mp.id
    FROM membership_packages mp
    WHERE LOWER(mp.name) = LOWER(p.package_name) OR LOWER(mp.code) = LOWER(p.package_name)
    ORDER BY mp.id
    LIMIT 1
  ),
  package_code = (
    SELECT mp.code
    FROM membership_packages mp
    WHERE LOWER(mp.name) = LOWER(p.package_name) OR LOWER(mp.code) = LOWER(p.package_name)
    ORDER BY mp.id
    LIMIT 1
  ),
  package_price_mmk = COALESCE(
    (
      SELECT mp.price_mmk
      FROM membership_packages mp
      WHERE LOWER(mp.name) = LOWER(p.package_name) OR LOWER(mp.code) = LOWER(p.package_name)
      ORDER BY mp.id
      LIMIT 1
    ),
    p.amount_mmk
  )
WHERE p.package_id IS NULL OR p.package_price_mmk IS NULL;

UPDATE membership_packages SET sort_order = 10 WHERE code = 'basic' AND sort_order = 0;
UPDATE membership_packages SET sort_order = 20 WHERE code = 'standard' AND sort_order = 0;
UPDATE membership_packages SET sort_order = 30 WHERE code = 'premium' AND sort_order = 0;
UPDATE membership_packages SET effective_from = CURDATE() WHERE effective_from IS NULL;

ALTER TABLE membership_actions
  MODIFY COLUMN action ENUM('freeze', 'renew', 'upgrade', 'downgrade', 'booking') NOT NULL;

ALTER TABLE member_requests
  MODIFY COLUMN request_type ENUM('freeze', 'renew', 'upgrade', 'downgrade') NOT NULL;
