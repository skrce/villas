CREATE TABLE IF NOT EXISTS apartments (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL DEFAULT 'villa-rosa',
    capacity INT NOT NULL CHECK (capacity > 0),
    orientation VARCHAR(200),
    view VARCHAR(200),
    regular_price INT CHECK (regular_price >= 0),
    top_season_price INT CHECK (top_season_price >= 0),
    UNIQUE KEY apartment_property_id (property_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL DEFAULT 'villa-rosa',
    first_name VARCHAR(200) NOT NULL,
    last_name VARCHAR(200) NOT NULL,
    phone VARCHAR(200) NOT NULL,
    address VARCHAR(200) NOT NULL,
    UNIQUE KEY customer_property_id (property_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservations (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL DEFAULT 'villa-rosa',
    customer_id INT NOT NULL,
    room_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT valid_stay CHECK (start_date >= '1000-01-01' AND end_date > start_date),
    CONSTRAINT reservation_customer FOREIGN KEY (property_id, customer_id) REFERENCES customers (property_id, id),
    CONSTRAINT reservation_room FOREIGN KEY (property_id, room_id) REFERENCES apartments (property_id, id),
    UNIQUE KEY reservation_property_id (property_id, id),
    KEY room_overlap (property_id, room_id, start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
