INSERT INTO businesses(id,name) VALUES('lake-house','Езеро');
INSERT INTO staff_property_lock(property_id) VALUES('lake-house');
INSERT INTO staff_accounts(id,property_id,issuer,subject,email,created_at) VALUES
  ('00000000-0000-0000-0000-000000000001','villa-rosa','https://accounts.google.com','synthetic-owner','owner@example.test',CURRENT_TIMESTAMP(6)),
  ('00000000-0000-0000-0000-000000000002','lake-house','https://accounts.google.com','__SECOND_SUBJECT__','owner@example.test',CURRENT_TIMESTAMP(6));
INSERT INTO staff_events(property_id,actor_id,kind,subject_type,subject_id,occurred_at) VALUES('lake-house','00000000-0000-0000-0000-000000000002','SYNTHETIC','STAFF','00000000-0000-0000-0000-000000000002',CURRENT_TIMESTAMP(6));
INSERT INTO apartments(id,property_id,capacity,name,reference) VALUES(1,'villa-rosa',2,'Езеро','R-1');
INSERT INTO customers(id,property_id,first_name,last_name) VALUES(1,'villa-rosa','Synthetic','Гостин');
INSERT INTO reservations(id,property_id,customer_id,room_id,start_date,end_date) VALUES(1,'villa-rosa',1,1,'2030-01-01','2030-01-03');
INSERT INTO booking_quotes(id,property_id,actor_id,room_id,start_date,end_date,guest_count,currency,rate_version,total_cents,price_json,created_at,expires_at) VALUES('quote-a','villa-rosa','00000000-0000-0000-0000-000000000001',1,'2030-01-01','2030-01-03',1,'EUR',0,100,'{}',CURRENT_TIMESTAMP(6),CURRENT_TIMESTAMP(6)+INTERVAL '15 minutes');
INSERT INTO reservation_prices(id,property_id,reservation_id,reservation_version,actor_id,quote_json,accepted_at) VALUES('quote-a','villa-rosa',1,0,'00000000-0000-0000-0000-000000000001','{}',CURRENT_TIMESTAMP(6));
INSERT INTO ledger_entries(property_id,reservation_id,reservation_version,actor_id,operation_key,kind,currency,amount_cents,method,effective_date,recorded_at) VALUES('villa-rosa',1,0,'00000000-0000-0000-0000-000000000001','synthetic-payment','PAYMENT','EUR',100,'CASH','2030-01-01',CURRENT_TIMESTAMP(6));
INSERT INTO SPRING_SESSION(PRIMARY_ID,SESSION_ID,CREATION_TIME,LAST_ACCESS_TIME,MAX_INACTIVE_INTERVAL,EXPIRY_TIME) VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',1,1,259200,9999999999999);
INSERT INTO SPRING_SESSION_ATTRIBUTES VALUES('00000000-0000-0000-0000-000000000001','synthetic-context',decode('ABCD','hex'));
