CREATE TABLE IF NOT EXISTS booking_quotes (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    actor_id VARCHAR(36) COLLATE utf8mb4_bin NOT NULL,
    room_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    guest_count INT NOT NULL CHECK (guest_count > 0),
    currency VARCHAR(3) NOT NULL CHECK (BINARY currency='EUR'),
    rate_version BIGINT NOT NULL CHECK (rate_version BETWEEN 0 AND 9007199254740991),
    total_cents BIGINT NOT NULL CHECK (total_cents BETWEEN 1 AND 9007199254740991),
    price_json LONGTEXT NOT NULL CHECK (JSON_VALID(price_json)),
    created_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL CHECK (expires_at > created_at),
    CONSTRAINT quote_valid_dates CHECK (
        YEAR(start_date) BETWEEN 1000 AND 9999 AND MONTH(start_date) BETWEEN 1 AND 12
        AND LAST_DAY(start_date) IS NOT NULL AND DAY(start_date) BETWEEN 1 AND DAY(LAST_DAY(start_date))
        AND YEAR(end_date) BETWEEN 1000 AND 9999 AND MONTH(end_date) BETWEEN 1 AND 12
        AND LAST_DAY(end_date) IS NOT NULL AND DAY(end_date) BETWEEN 1 AND DAY(LAST_DAY(end_date))
        AND end_date > start_date
    ),
    CONSTRAINT quote_room FOREIGN KEY (property_id, room_id) REFERENCES apartments(property_id, id),
    CONSTRAINT quote_owner FOREIGN KEY (actor_id) REFERENCES staff_accounts(id),
    UNIQUE KEY quote_property_id (property_id, id),
    KEY owner_quotes (property_id, actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS accepted_quote_id VARCHAR(36) NULL;

ALTER TABLE reservations ADD CONSTRAINT reservation_accepted_quote
    FOREIGN KEY IF NOT EXISTS (property_id, accepted_quote_id) REFERENCES booking_quotes(property_id, id);

CREATE TABLE IF NOT EXISTS reservation_prices (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    reservation_id INT NOT NULL,
    reservation_version BIGINT NOT NULL CHECK (reservation_version BETWEEN 0 AND 9007199254740991),
    actor_id VARCHAR(36) COLLATE utf8mb4_bin NOT NULL,
    quote_json LONGTEXT NOT NULL CHECK (JSON_VALID(quote_json)),
    accepted_at DATETIME(6) NOT NULL,
    CONSTRAINT price_quote FOREIGN KEY (property_id, id) REFERENCES booking_quotes(property_id, id),
    CONSTRAINT price_reservation FOREIGN KEY (property_id, reservation_id) REFERENCES reservations(property_id, id),
    CONSTRAINT price_owner FOREIGN KEY (actor_id) REFERENCES staff_accounts(id),
    UNIQUE KEY reservation_price_version (property_id, reservation_id, reservation_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
