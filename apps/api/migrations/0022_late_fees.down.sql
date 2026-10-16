-- Postgres can't drop an enum value: late fees become plain EXACT
-- expenses (the same balances) before the type loses INTEREST.
DROP TABLE late_fee_days;
ALTER TABLE groups
    DROP COLUMN interest_since,
    DROP COLUMN interest_cap_bp,
    DROP COLUMN interest_grace_days,
    DROP COLUMN interest_rate_bp;
UPDATE expenses SET split_type = 'EXACT' WHERE split_type = 'INTEREST';
ALTER TYPE split_type RENAME TO split_type_old;
CREATE TYPE split_type AS ENUM ('EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES', 'SETTLEMENT');
ALTER TABLE expenses ALTER COLUMN split_type TYPE split_type USING split_type::text::split_type;
DROP TYPE split_type_old;
