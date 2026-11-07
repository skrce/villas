ALTER TABLE reservations ADD COLUMN IF NOT EXISTS finance_revision BIGINT NOT NULL DEFAULT 0
    CHECK (finance_revision BETWEEN 0 AND 9007199254740991);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    reservation_id INT NOT NULL,
    reservation_version BIGINT NOT NULL CHECK (reservation_version BETWEEN 0 AND 9007199254740991),
    actor_id VARCHAR(36) COLLATE utf8mb4_bin NOT NULL,
    operation_key VARCHAR(36) NOT NULL,
    kind VARCHAR(16) NOT NULL CHECK (BINARY kind IN ('PAYMENT','REFUND','REVERSAL')),
    currency VARCHAR(3) NOT NULL CHECK (BINARY currency='EUR'),
    amount_cents BIGINT NOT NULL CHECK (amount_cents BETWEEN 1 AND 9007199254740991),
    method VARCHAR(16) NULL CHECK (method IS NULL OR BINARY method IN ('CASH','CARD','BANK_TRANSFER')),
    payment_id BIGINT NULL,
    reverses_id BIGINT NULL,
    reason VARCHAR(500) NULL,
    reference VARCHAR(100) NULL,
    effective_date DATE NOT NULL,
    recorded_at DATETIME(6) NOT NULL,
    CONSTRAINT ledger_date CHECK (
        YEAR(effective_date) BETWEEN 1000 AND 9999 AND MONTH(effective_date) BETWEEN 1 AND 12
        AND LAST_DAY(effective_date) IS NOT NULL AND DAY(effective_date) BETWEEN 1 AND DAY(LAST_DAY(effective_date))
    ),
    CONSTRAINT ledger_shape CHECK (
        (BINARY kind='PAYMENT' AND method IS NOT NULL AND payment_id IS NULL AND reverses_id IS NULL)
        OR (BINARY kind='REFUND' AND method IS NOT NULL AND payment_id IS NOT NULL AND reverses_id IS NULL AND reason IS NOT NULL AND CHAR_LENGTH(reason)>0)
        OR (BINARY kind='REVERSAL' AND method IS NULL AND payment_id IS NULL AND reverses_id IS NOT NULL AND reason IS NOT NULL AND CHAR_LENGTH(reason)>0 AND reference IS NULL)
    ),
    UNIQUE KEY property_ledger_entry (property_id,reservation_id,id),
    UNIQUE KEY ledger_reversal (property_id,reverses_id),
    UNIQUE KEY ledger_reservation_version (property_id,reservation_id,reservation_version),
    CONSTRAINT ledger_reservation FOREIGN KEY (property_id,reservation_id) REFERENCES reservations(property_id,id),
    CONSTRAINT ledger_actor FOREIGN KEY (actor_id) REFERENCES staff_accounts(id),
    CONSTRAINT ledger_payment FOREIGN KEY (property_id,reservation_id,payment_id) REFERENCES ledger_entries(property_id,reservation_id,id),
    CONSTRAINT ledger_reversed FOREIGN KEY (property_id,reservation_id,reverses_id) REFERENCES ledger_entries(property_id,reservation_id,id),
    KEY ledger_history (property_id,reservation_id,id),
    KEY ledger_allocations (property_id,reservation_id,payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
