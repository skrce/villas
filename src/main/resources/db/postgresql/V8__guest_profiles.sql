ALTER TABLE customers
    ALTER COLUMN phone DROP NOT NULL,
    ALTER COLUMN address TYPE VARCHAR(500),
    ALTER COLUMN address DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS email VARCHAR(254) NULL,
    ADD COLUMN IF NOT EXISTS notes VARCHAR(2000) NULL,
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS guest_directory ON customers (property_id, active, id);
CREATE INDEX IF NOT EXISTS guest_reservation_history ON reservations (property_id, customer_id, id);
