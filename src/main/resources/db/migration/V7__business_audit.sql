CREATE TABLE IF NOT EXISTS business_events (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    actor_id VARCHAR(36) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    subject_type VARCHAR(32) NOT NULL,
    subject_id VARCHAR(36) NOT NULL,
    occurred_at DATETIME(6) NOT NULL,
    CONSTRAINT business_event_actor FOREIGN KEY (property_id, actor_id) REFERENCES staff_accounts (property_id, id),
    KEY business_event_history (property_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
