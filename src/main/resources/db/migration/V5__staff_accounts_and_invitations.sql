CREATE TABLE IF NOT EXISTS staff_property_lock (
    property_id VARCHAR(64) NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT IGNORE INTO staff_property_lock (property_id) VALUES ('villa-rosa');

CREATE TABLE IF NOT EXISTS staff_accounts (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    issuer VARCHAR(255) NOT NULL CHECK (CHAR_LENGTH(issuer) > 0),
    subject VARCHAR(255) NOT NULL CHECK (CHAR_LENGTH(subject) > 0),
    email VARCHAR(254) NOT NULL CHECK (CHAR_LENGTH(email) > 0 AND BINARY email = BINARY LOWER(TRIM(email))),
    role VARCHAR(16) NOT NULL DEFAULT 'OWNER' CHECK (BINARY role = 'OWNER'),
    active BOOLEAN NOT NULL DEFAULT TRUE CHECK (active IN (0, 1)),
    security_version BIGINT NOT NULL DEFAULT 0 CHECK (security_version >= 0),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at DATETIME(6) NOT NULL,
    UNIQUE KEY staff_identity (property_id, issuer, subject),
    UNIQUE KEY staff_email (property_id, email),
    UNIQUE KEY staff_property_id (property_id, id),
    KEY active_owners (property_id, active, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS staff_invitations (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    email VARCHAR(254) NOT NULL CHECK (CHAR_LENGTH(email) > 0 AND BINARY email = BINARY LOWER(TRIM(email))),
    state VARCHAR(16) NOT NULL CHECK (BINARY state IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
    created_by VARCHAR(36),
    accepted_by VARCHAR(36),
    created_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT invitation_expiry CHECK (expires_at > created_at),
    CONSTRAINT invitation_creator FOREIGN KEY (property_id, created_by) REFERENCES staff_accounts (property_id, id),
    CONSTRAINT invitation_recipient FOREIGN KEY (property_id, accepted_by) REFERENCES staff_accounts (property_id, id),
    KEY pending_invitation (property_id, email, state, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS staff_events (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL,
    actor_id VARCHAR(36),
    kind VARCHAR(32) NOT NULL,
    subject_type VARCHAR(16) NOT NULL CHECK (BINARY subject_type IN ('STAFF', 'INVITATION')),
    subject_id VARCHAR(36) NOT NULL,
    occurred_at DATETIME(6) NOT NULL,
    CONSTRAINT staff_event_actor FOREIGN KEY (property_id, actor_id) REFERENCES staff_accounts (property_id, id),
    KEY staff_history (property_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
