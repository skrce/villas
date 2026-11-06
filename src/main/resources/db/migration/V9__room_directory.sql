ALTER TABLE apartments
    ADD COLUMN IF NOT EXISTS name VARCHAR(200) NOT NULL DEFAULT 'Room',
    ADD COLUMN IF NOT EXISTS reference VARCHAR(32) NULL,
    ADD COLUMN IF NOT EXISTS bed_configuration VARCHAR(200) NULL,
    ADD COLUMN IF NOT EXISTS features VARCHAR(1000) NULL,
    ADD COLUMN IF NOT EXISTS floor VARCHAR(50) NULL;

UPDATE apartments
SET name=LEFT(CONCAT(COALESCE(NULLIF(TRIM(view), ''), 'Room'), CASE WHEN NULLIF(TRIM(orientation), '') IS NULL THEN '' ELSE CONCAT(' · ', TRIM(orientation)) END), 200)
WHERE reference IS NULL AND name='Room';

UPDATE apartments SET reference=CONCAT('ROOM-', id) WHERE reference IS NULL;

ALTER TABLE apartments MODIFY COLUMN reference VARCHAR(32) NOT NULL
    DEFAULT (CONCAT('R-', UPPER(LEFT(REPLACE(UUID(), '-', ''), 16))));

CREATE UNIQUE INDEX IF NOT EXISTS room_reference ON apartments (property_id, reference);
