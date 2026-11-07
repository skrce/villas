ALTER TABLE reservations
    ADD COLUMN IF NOT EXISTS stay_phase VARCHAR(16) NOT NULL DEFAULT 'CONFIRMED',
    ADD COLUMN IF NOT EXISTS checked_in_at DATETIME(6) NULL,
    ADD COLUMN IF NOT EXISTS checked_out_at DATETIME(6) NULL;

UPDATE reservations SET stay_phase='CANCELLED'
    WHERE status='CANCELLED' AND stay_phase='CONFIRMED';

ALTER TABLE reservations ADD CONSTRAINT IF NOT EXISTS stay_phase_status CHECK (
    (BINARY status='ACTIVE' AND BINARY stay_phase IN ('CONFIRMED','CHECKED_IN','CHECKED_OUT'))
    OR (BINARY status='CANCELLED' AND BINARY stay_phase IN ('CANCELLED','NO_SHOW'))
);
ALTER TABLE reservations ADD CONSTRAINT IF NOT EXISTS stay_phase_times CHECK (
    (BINARY stay_phase IN ('CONFIRMED','CANCELLED','NO_SHOW') AND checked_in_at IS NULL AND checked_out_at IS NULL)
    OR (BINARY stay_phase='CHECKED_IN' AND checked_in_at IS NOT NULL AND checked_out_at IS NULL)
    OR (BINARY stay_phase='CHECKED_OUT' AND checked_in_at IS NOT NULL AND checked_out_at IS NOT NULL AND checked_out_at>=checked_in_at)
);
CREATE INDEX IF NOT EXISTS physical_room_occupancy ON reservations(property_id,room_id,stay_phase);
CREATE INDEX IF NOT EXISTS stay_arrivals ON reservations(property_id,stay_phase,start_date,id);
CREATE INDEX IF NOT EXISTS stay_departures ON reservations(property_id,stay_phase,end_date,id);

ALTER TABLE inventory_events
    ADD COLUMN IF NOT EXISTS reason VARCHAR(500) NULL,
    ADD COLUMN IF NOT EXISTS stay_phase VARCHAR(16) NULL,
    ADD COLUMN IF NOT EXISTS checked_in_at DATETIME(6) NULL,
    ADD COLUMN IF NOT EXISTS checked_out_at DATETIME(6) NULL;

CREATE TABLE IF NOT EXISTS room_readiness (
    room_id INT NOT NULL PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    state VARCHAR(16) NOT NULL DEFAULT 'DIRTY' CHECK (BINARY state IN ('DIRTY','IN_PROGRESS','INSPECTION','CLEAN')),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version BETWEEN 0 AND 9007199254740991),
    changed_at DATETIME(6) NOT NULL,
    CONSTRAINT readiness_room FOREIGN KEY (property_id,room_id) REFERENCES apartments(property_id,id),
    UNIQUE KEY property_readiness (property_id,room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO room_readiness (room_id,property_id,state,version,changed_at)
    SELECT id,property_id,'DIRTY',0,UTC_TIMESTAMP(6) FROM apartments;

CREATE TABLE IF NOT EXISTS readiness_events (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    room_id INT NOT NULL,
    actor_id VARCHAR(36) COLLATE utf8mb4_bin NOT NULL,
    operation_key VARCHAR(36) NOT NULL,
    resource_version BIGINT NOT NULL CHECK (resource_version BETWEEN 0 AND 9007199254740991),
    previous_state VARCHAR(16) NOT NULL CHECK (BINARY previous_state IN ('DIRTY','IN_PROGRESS','INSPECTION','CLEAN')),
    state VARCHAR(16) NOT NULL CHECK (BINARY state IN ('DIRTY','IN_PROGRESS','INSPECTION','CLEAN')),
    reason VARCHAR(500) NULL,
    reservation_id INT NULL,
    occurred_at DATETIME(6) NOT NULL,
    CONSTRAINT readiness_event_room FOREIGN KEY (property_id,room_id) REFERENCES apartments(property_id,id),
    CONSTRAINT readiness_event_actor FOREIGN KEY (actor_id) REFERENCES staff_accounts(id),
    CONSTRAINT readiness_event_reservation FOREIGN KEY (property_id,reservation_id) REFERENCES reservations(property_id,id),
    UNIQUE KEY readiness_event_version (property_id,room_id,resource_version),
    KEY readiness_history (property_id,room_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
