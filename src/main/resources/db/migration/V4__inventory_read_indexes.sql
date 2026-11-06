CREATE INDEX IF NOT EXISTS reservation_calendar ON reservations (property_id, start_date, end_date, id);
CREATE INDEX IF NOT EXISTS reservation_guest_list ON reservations (property_id, customer_id, status, start_date, id);
CREATE INDEX IF NOT EXISTS block_calendar ON maintenance_blocks (property_id, start_date, end_date, id);
CREATE INDEX IF NOT EXISTS reservation_history ON inventory_events (property_id, reservation_id, id);
CREATE INDEX IF NOT EXISTS block_history ON inventory_events (property_id, maintenance_block_id, id);
