START TRANSACTION;
INSERT INTO apartments (capacity, orientation, view, regular_price, top_season_price)
VALUES (2, 'South', 'Synthetic lake room', 100, 150),
       (4, 'East', 'Synthetic garden room', 140, 190);
COMMIT;
