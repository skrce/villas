-- Locking SELECTs require an UPDATE grant; the zero token keeps business settings read-only.
ALTER TABLE businesses ADD COLUMN lock_token SMALLINT NOT NULL DEFAULT 0
    CONSTRAINT business_lock_token CHECK(lock_token=0);

CREATE TABLE staff_identities (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    issuer VARCHAR(255) NOT NULL CHECK (CHAR_LENGTH(issuer)>0),
    subject VARCHAR(255) NOT NULL CHECK (CHAR_LENGTH(subject)>0),
    email VARCHAR(254) NOT NULL CHECK (CHAR_LENGTH(email)>0 AND email=LOWER(TRIM(email))),
    security_version BIGINT NOT NULL DEFAULT 0 CHECK (security_version>=0),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version>=0),
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    CONSTRAINT google_identity UNIQUE(issuer,subject)
);

INSERT INTO staff_identities(id,issuer,subject,email,created_at)
    SELECT MIN(id),issuer,subject,MIN(email),MIN(created_at)
    FROM staff_accounts GROUP BY issuer,subject;

ALTER TABLE staff_accounts ADD CONSTRAINT membership_identity
    FOREIGN KEY(issuer,subject) REFERENCES staff_identities(issuer,subject);

CREATE TABLE staff_identity_lock (
    singleton SMALLINT NOT NULL PRIMARY KEY CHECK(singleton=1),
    lock_token SMALLINT NOT NULL DEFAULT 0 CHECK(lock_token=0)
);
INSERT INTO staff_identity_lock(singleton) VALUES(1);

ALTER TABLE staff_invitations ADD CONSTRAINT invitation_business_id UNIQUE(property_id,id);
CREATE TABLE business_onboarding (
    property_id VARCHAR(64) NOT NULL PRIMARY KEY REFERENCES businesses(id),
    request_hash VARCHAR(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
    invitation_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT onboarding_invitation FOREIGN KEY(property_id,invitation_id)
        REFERENCES staff_invitations(property_id,id)
);

DELETE FROM SPRING_SESSION_ATTRIBUTES WHERE SESSION_PRIMARY_ID IS NOT NULL;
DELETE FROM SPRING_SESSION WHERE PRIMARY_ID IS NOT NULL;
