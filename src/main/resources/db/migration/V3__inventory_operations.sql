CREATE TABLE IF NOT EXISTS maintenance_blocks (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL DEFAULT 'villa-rosa',
    room_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(200) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (BINARY status IN ('ACTIVE', 'CANCELLED')),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT block_valid_stay CHECK (
        YEAR(start_date) BETWEEN 1000 AND 9999 AND MONTH(start_date) BETWEEN 1 AND 12
        AND LAST_DAY(start_date) IS NOT NULL AND DAY(start_date) BETWEEN 1 AND DAY(LAST_DAY(start_date))
        AND YEAR(end_date) BETWEEN 1000 AND 9999 AND MONTH(end_date) BETWEEN 1 AND 12
        AND LAST_DAY(end_date) IS NOT NULL AND DAY(end_date) BETWEEN 1 AND DAY(LAST_DAY(end_date))
        AND end_date > start_date
    ),
    CONSTRAINT block_room FOREIGN KEY (property_id, room_id) REFERENCES apartments (property_id, id),
    UNIQUE KEY block_property_id (property_id, id),
    KEY block_overlap (property_id, room_id, status, start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_operations (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    operation_kind VARCHAR(32) NOT NULL,
    operation_key VARCHAR(36) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    result_json LONGTEXT CHECK (result_json IS NULL OR JSON_VALID(result_json)),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY operation_identity (property_id, actor_id, operation_kind, operation_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_events (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    operation_key VARCHAR(36) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    reservation_id INT,
    maintenance_block_id INT,
    resource_version BIGINT NOT NULL CHECK (resource_version >= 0),
    room_id INT NOT NULL,
    previous_room_id INT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    guest_count INT,
    occurred_at DATETIME(6) NOT NULL,
    CONSTRAINT event_subject CHECK ((reservation_id IS NOT NULL AND maintenance_block_id IS NULL) OR (reservation_id IS NULL AND maintenance_block_id IS NOT NULL)),
    CONSTRAINT event_reservation FOREIGN KEY (property_id, reservation_id) REFERENCES reservations (property_id, id),
    CONSTRAINT event_block FOREIGN KEY (property_id, maintenance_block_id) REFERENCES maintenance_blocks (property_id, id),
    CONSTRAINT event_room FOREIGN KEY (property_id, room_id) REFERENCES apartments (property_id, id),
    CONSTRAINT event_previous_room FOREIGN KEY (property_id, previous_room_id) REFERENCES apartments (property_id, id),
    UNIQUE KEY reservation_event_version (property_id, reservation_id, resource_version),
    UNIQUE KEY block_event_version (property_id, maintenance_block_id, resource_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
