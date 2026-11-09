SET LOCAL standard_conforming_strings = on;

CREATE TABLE IF NOT EXISTS businesses (
    id VARCHAR(64) NOT NULL PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
    name VARCHAR(100) NOT NULL CHECK (CHAR_LENGTH(TRIM(name)) > 0 AND name !~ '[[:cntrl:]]'),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR' CHECK (currency='EUR'),
    property_timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Skopje' CHECK (property_timezone='Europe/Skopje'),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version>=0),
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

INSERT INTO businesses(id,name)
    SELECT property_id,'${propertyName}' FROM property_identity WHERE singleton=1
    ON CONFLICT DO NOTHING;

DO $$
DECLARE tenant_table TEXT;
BEGIN
    FOREACH tenant_table IN ARRAY ARRAY[
        'apartments','customers','reservations','maintenance_blocks',
        'inventory_operations','inventory_events','staff_property_lock',
        'staff_accounts','staff_invitations','staff_events','business_events',
        'seasonal_rates','booking_quotes','reservation_prices','room_readiness',
        'readiness_events','ledger_entries','reservation_allocations','recovery_events',
        'property_identity'
    ] LOOP
        IF NOT EXISTS (
            SELECT FROM pg_constraint WHERE conrelid=to_regclass('public.' || tenant_table)
                AND conname=tenant_table || '_business'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(property_id) REFERENCES businesses(id)',
                tenant_table,tenant_table || '_business');
        END IF;
    END LOOP;
END $$;

ALTER TABLE booking_quotes DROP CONSTRAINT IF EXISTS quote_owner;
ALTER TABLE booking_quotes ADD CONSTRAINT quote_owner
    FOREIGN KEY(property_id,actor_id) REFERENCES staff_accounts(property_id,id);
ALTER TABLE reservation_prices DROP CONSTRAINT IF EXISTS price_owner;
ALTER TABLE reservation_prices ADD CONSTRAINT price_owner
    FOREIGN KEY(property_id,actor_id) REFERENCES staff_accounts(property_id,id);
ALTER TABLE readiness_events DROP CONSTRAINT IF EXISTS readiness_event_actor;
ALTER TABLE readiness_events ADD CONSTRAINT readiness_event_actor
    FOREIGN KEY(property_id,actor_id) REFERENCES staff_accounts(property_id,id);
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_actor;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_actor
    FOREIGN KEY(property_id,actor_id) REFERENCES staff_accounts(property_id,id);
