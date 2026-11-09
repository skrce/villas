START TRANSACTION;
INSERT INTO apartments (name, reference, capacity, orientation, view, bed_configuration, features, regular_price, top_season_price, base_rate_cents, rate_version, rate_currency)
VALUES ('Synthetic lake room · South', 'DEMO-LAKE', 2, 'South', 'Synthetic lake room', 'Queen bed', 'Synthetic balcony', 100, 150, 5001, 1, 'EUR'),
       ('Synthetic garden room · East', 'DEMO-GARDEN', 4, 'East', 'Synthetic garden room', 'Queen and two single beds', 'Synthetic terrace', 140, 190, 6001, 1, 'EUR');
COMMIT;

SELECT setval(pg_get_serial_sequence('apartments','id'), COALESCE((SELECT MAX(id) FROM apartments),1));
