UPDATE membership_packages
SET
  description = COALESCE(description, 'Gym access membership'),
  freeze_allowance_days = 0,
  renewal_window_days = 30,
  allow_upgrade = TRUE,
  allow_downgrade = FALSE,
  sort_order = 10
WHERE code = 'basic';

UPDATE membership_packages
SET
  description = COALESCE(description, 'Gym access with standard membership benefits'),
  freeze_allowance_days = 14,
  renewal_window_days = 30,
  allow_upgrade = TRUE,
  allow_downgrade = TRUE,
  sort_order = 20
WHERE code = 'standard';

UPDATE membership_packages
SET
  description = COALESCE(description, 'Premium all-access membership'),
  freeze_allowance_days = 30,
  renewal_window_days = 45,
  allow_upgrade = FALSE,
  allow_downgrade = TRUE,
  sort_order = 30
WHERE code = 'premium';
