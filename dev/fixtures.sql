START TRANSACTION;
LOCK TABLE apartments, customers, reservations IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM apartments) OR EXISTS (SELECT 1 FROM customers) OR EXISTS (SELECT 1 FROM reservations) THEN
        RAISE EXCEPTION 'Fixtures require empty business tables.';
    END IF;
END $$;
INSERT INTO apartments (property_id, name, reference, capacity, orientation, view, bed_configuration, features, regular_price, top_season_price, base_rate_cents, rate_version, rate_currency)
VALUES ('__VILLAS_FIXTURE_BUSINESS__', 'Synthetic lake room · South', 'DEMO-LAKE', 2, 'South', 'Synthetic lake room', 'Queen bed', 'Synthetic balcony', 100, 150, 5001, 1, 'EUR'),
       ('__VILLAS_FIXTURE_BUSINESS__', 'Synthetic garden room · East', 'DEMO-GARDEN', 4, 'East', 'Synthetic garden room', 'Queen and two single beds', 'Synthetic terrace', 140, 190, 6001, 1, 'EUR');
COMMIT;

SELECT setval(pg_get_serial_sequence('apartments','id'), COALESCE((SELECT MAX(id) FROM apartments),1));
