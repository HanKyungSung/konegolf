-- Update defaultDescription for the birthday CouponType to new wording
UPDATE "CouponType"
SET "defaultDescription" = '1 hour free, tax included.'
WHERE "name" = 'birthday';
