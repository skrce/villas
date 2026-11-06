START TRANSACTION;
INSERT INTO apartments (name, reference, capacity, orientation, view, bed_configuration, features, regular_price, top_season_price)
VALUES ('Synthetic lake room · South', 'DEMO-LAKE', 2, 'South', 'Synthetic lake room', 'Queen bed', 'Synthetic balcony', 100, 150),
       ('Synthetic garden room · East', 'DEMO-GARDEN', 4, 'East', 'Synthetic garden room', 'Queen and two single beds', 'Synthetic terrace', 140, 190);
COMMIT;
