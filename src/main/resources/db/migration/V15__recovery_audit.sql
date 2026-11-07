CREATE TABLE IF NOT EXISTS recovery_events (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    snapshot_id CHAR(64) NOT NULL,
    invalidated_sessions BIGINT NOT NULL CHECK (invalidated_sessions >= 0),
    changed_staff BIGINT NOT NULL CHECK (changed_staff >= 0),
    occurred_at DATETIME(6) NOT NULL,
    CHECK (snapshot_id REGEXP '^[a-f0-9]{64}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
