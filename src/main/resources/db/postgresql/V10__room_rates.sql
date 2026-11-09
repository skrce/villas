ALTER TABLE apartments
    ADD COLUMN IF NOT EXISTS base_rate_cents BIGINT NULL CHECK (base_rate_cents BETWEEN 1 AND 9007199254740991),
    ADD COLUMN IF NOT EXISTS rate_version BIGINT NOT NULL DEFAULT 0 CHECK (rate_version BETWEEN 0 AND 9007199254740991),
    ADD COLUMN IF NOT EXISTS rate_currency VARCHAR(3) NOT NULL DEFAULT 'EUR' CHECK (rate_currency='EUR');

CREATE TABLE IF NOT EXISTS seasonal_rates (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    room_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    nightly_cents BIGINT NOT NULL CHECK (nightly_cents BETWEEN 1 AND 9007199254740991),
    CONSTRAINT season_valid_dates CHECK (
        start_date BETWEEN DATE '1000-01-01' AND DATE '9999-12-31'
        AND end_date BETWEEN DATE '1000-01-01' AND DATE '9999-12-31'
        AND end_date > start_date
    ),
    CONSTRAINT season_room FOREIGN KEY (property_id, room_id) REFERENCES apartments(property_id, id),
    CONSTRAINT season_start UNIQUE (property_id, room_id, start_date)
);
