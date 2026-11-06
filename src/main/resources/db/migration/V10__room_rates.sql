ALTER TABLE apartments
    ADD COLUMN IF NOT EXISTS base_rate_cents BIGINT NULL CHECK (base_rate_cents BETWEEN 1 AND 9007199254740991),
    ADD COLUMN IF NOT EXISTS rate_version BIGINT NOT NULL DEFAULT 0 CHECK (rate_version BETWEEN 0 AND 9007199254740991),
    ADD COLUMN IF NOT EXISTS rate_currency VARCHAR(3) NOT NULL DEFAULT 'EUR' CHECK (BINARY rate_currency='EUR');

CREATE TABLE IF NOT EXISTS seasonal_rates (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    room_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    nightly_cents BIGINT NOT NULL CHECK (nightly_cents BETWEEN 1 AND 9007199254740991),
    CONSTRAINT season_valid_dates CHECK (
        YEAR(start_date) BETWEEN 1000 AND 9999 AND MONTH(start_date) BETWEEN 1 AND 12
        AND LAST_DAY(start_date) IS NOT NULL AND DAY(start_date) BETWEEN 1 AND DAY(LAST_DAY(start_date))
        AND YEAR(end_date) BETWEEN 1000 AND 9999 AND MONTH(end_date) BETWEEN 1 AND 12
        AND LAST_DAY(end_date) IS NOT NULL AND DAY(end_date) BETWEEN 1 AND DAY(LAST_DAY(end_date))
        AND end_date > start_date
    ),
    CONSTRAINT season_room FOREIGN KEY (property_id, room_id) REFERENCES apartments(property_id, id),
    CONSTRAINT season_start UNIQUE (property_id, room_id, start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
