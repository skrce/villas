ALTER TABLE reservations ADD COLUMN IF NOT EXISTS room_from_date DATE NULL;
UPDATE reservations SET room_from_date=start_date WHERE room_from_date IS NULL;
ALTER TABLE inventory_events ADD COLUMN IF NOT EXISTS room_from_date DATE NULL;

CREATE TABLE IF NOT EXISTS reservation_allocations (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    reservation_id INT NOT NULL,
    room_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    CONSTRAINT allocation_dates CHECK (
        YEAR(start_date) BETWEEN 1000 AND 9999 AND MONTH(start_date) BETWEEN 1 AND 12
        AND LAST_DAY(start_date) IS NOT NULL AND DAY(start_date) BETWEEN 1 AND DAY(LAST_DAY(start_date))
        AND YEAR(end_date) BETWEEN 1000 AND 9999 AND MONTH(end_date) BETWEEN 1 AND 12
        AND LAST_DAY(end_date) IS NOT NULL AND DAY(end_date) BETWEEN 1 AND DAY(LAST_DAY(end_date))
        AND end_date > start_date
    ),
    CONSTRAINT allocation_reservation FOREIGN KEY(property_id,reservation_id) REFERENCES reservations(property_id,id),
    CONSTRAINT allocation_room FOREIGN KEY(property_id,room_id) REFERENCES apartments(property_id,id),
    UNIQUE KEY allocation_start(property_id,reservation_id,start_date),
    KEY allocation_room_window(property_id,room_id,start_date,end_date),
    KEY allocation_history(property_id,reservation_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO reservation_allocations(property_id,reservation_id,room_id,start_date,end_date)
    SELECT r.property_id,r.id,r.room_id,r.start_date,r.end_date FROM reservations r
    WHERE NOT EXISTS(SELECT 1 FROM reservation_allocations a WHERE a.property_id=r.property_id AND a.reservation_id=r.id);
