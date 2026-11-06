ALTER TABLE customers
    MODIFY COLUMN phone VARCHAR(200) NULL,
    MODIFY COLUMN address VARCHAR(500) NULL,
    ADD COLUMN IF NOT EXISTS email VARCHAR(254) NULL,
    ADD COLUMN IF NOT EXISTS notes VARCHAR(2000) NULL,
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE CHECK (active IN (0, 1));

CREATE INDEX IF NOT EXISTS guest_directory ON customers (property_id, active, id);
CREATE INDEX IF NOT EXISTS guest_reservation_history ON reservations (property_id, customer_id, id);
