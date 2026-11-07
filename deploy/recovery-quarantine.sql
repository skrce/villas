SET time_zone='+00:00';
START TRANSACTION;
INSERT INTO recovery_events(id,property_id,snapshot_id,invalidated_sessions,changed_staff,occurred_at)
SELECT UUID(),'villa-rosa','__SNAPSHOT_ID__',
       (SELECT COUNT(*) FROM SPRING_SESSION),
       (SELECT COUNT(*) FROM staff_accounts WHERE property_id='villa-rosa'),
       CURRENT_TIMESTAMP(6);
DELETE FROM SPRING_SESSION WHERE PRIMARY_ID IS NOT NULL;
UPDATE staff_accounts SET security_version=security_version+1 WHERE property_id='villa-rosa';
COMMIT;
