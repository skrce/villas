CREATE TABLE IF NOT EXISTS booking_quotes (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    actor_id VARCHAR(36) NOT NULL,
    room_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    guest_count INT NOT NULL CHECK (guest_count > 0),
    currency VARCHAR(3) NOT NULL CHECK (currency='EUR'),
    rate_version BIGINT NOT NULL CHECK (rate_version BETWEEN 0 AND 9007199254740991),
    total_cents BIGINT NOT NULL CHECK (total_cents BETWEEN 1 AND 9007199254740991),
    price_json TEXT NOT NULL CHECK (price_json IS JSON),
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP(6) WITH TIME ZONE NOT NULL CHECK (expires_at > created_at),
    CONSTRAINT quote_valid_dates CHECK (
        start_date BETWEEN DATE '1000-01-01' AND DATE '9999-12-31'
        AND end_date BETWEEN DATE '1000-01-01' AND DATE '9999-12-31'
        AND end_date > start_date
    ),
    CONSTRAINT quote_room FOREIGN KEY (property_id, room_id) REFERENCES apartments(property_id, id),
    CONSTRAINT quote_owner FOREIGN KEY (actor_id) REFERENCES staff_accounts(id),
    CONSTRAINT quote_property_id UNIQUE (property_id, id)
);
CREATE INDEX IF NOT EXISTS owner_quotes ON booking_quotes (property_id, actor_id, created_at);

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS accepted_quote_id VARCHAR(36) NULL;

ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservation_accepted_quote;
ALTER TABLE reservations ADD CONSTRAINT reservation_accepted_quote
    FOREIGN KEY (property_id, accepted_quote_id) REFERENCES booking_quotes(property_id, id);

CREATE TABLE IF NOT EXISTS reservation_prices (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    reservation_id INT NOT NULL,
    reservation_version BIGINT NOT NULL CHECK (reservation_version BETWEEN 0 AND 9007199254740991),
    actor_id VARCHAR(36) NOT NULL,
    quote_json TEXT NOT NULL CHECK (quote_json IS JSON),
    accepted_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    CONSTRAINT price_quote FOREIGN KEY (property_id, id) REFERENCES booking_quotes(property_id, id),
    CONSTRAINT price_reservation FOREIGN KEY (property_id, reservation_id) REFERENCES reservations(property_id, id),
    CONSTRAINT price_owner FOREIGN KEY (actor_id) REFERENCES staff_accounts(id),
    CONSTRAINT reservation_price_version UNIQUE (property_id, reservation_id, reservation_version)
);
