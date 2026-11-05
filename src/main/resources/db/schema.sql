CREATE TABLE apartments (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    capacity INT,
    orientation VARCHAR(200),
    view VARCHAR(200),
    regular_price INT,
    top_season_price INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(200),
    last_name VARCHAR(200),
    phone VARCHAR(200),
    address VARCHAR(200),
    created_date DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reservations (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_id INT,
    room_id INT,
    start_date DATETIME(6),
    end_date DATETIME(6),
    created_date DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
