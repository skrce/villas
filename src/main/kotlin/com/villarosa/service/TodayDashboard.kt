package com.villarosa.service

import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class TodayDashboard(
    private val jdbc: JdbcTemplate,
    private val daily: DailyOperations,
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val time: PropertyTime,
) {
    @Transactional(
        readOnly = true,
        propagation = Propagation.REQUIRES_NEW,
        isolation = Isolation.REPEATABLE_READ,
    )
    fun read(): TodayView {
        access.current(current.identity())
        ReportMoney.assertSource(
            jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM reservations r ${ReportMoney.JOINS} WHERE r.property_id=? AND (${ReportMoney.INVALID_SOURCE}))",
                Boolean::class.java,
                PropertyScope.ID,
            ) == true
        )
        val now = time.now()
        val today = time.date(now)
        fun queue(list: FrontDeskList, predicate: String, vararg dates: Any): TodayQueue {
            val count =
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM reservations r WHERE r.property_id=? AND ($predicate)",
                    Long::class.java,
                    PropertyScope.ID,
                    *dates,
                )!!
            return TodayQueue(count, daily.deskSnapshot(list, 0, 5, today.toString()).items)
        }
        val arrivals =
            queue(
                FrontDeskList.ARRIVALS,
                "r.stay_phase IN ('CONFIRMED','CHECKED_IN') AND r.start_date=?",
                today,
            )
        val departures =
            queue(
                FrontDeskList.DEPARTURES,
                "r.stay_phase IN ('CONFIRMED','CHECKED_IN','CHECKED_OUT') AND r.end_date=?",
                today,
            )
        val inHouse = queue(FrontDeskList.IN_HOUSE, "r.stay_phase='CHECKED_IN'")
        val attention =
            queue(
                FrontDeskList.ATTENTION,
                "(r.stay_phase='CONFIRMED' AND r.start_date<?) OR (r.stay_phase='CHECKED_IN' AND r.end_date<?)",
                today,
                today,
            )
        val guests =
            jdbc.queryForObject(
                "SELECT COALESCE(SUM(guest_count),0) FROM reservations WHERE property_id=? AND stay_phase='CHECKED_IN'",
                Long::class.java,
                PropertyScope.ID,
            )!!
        val rooms =
            jdbc.queryForMap(
                "SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN a.base_rate_cents IS NULL THEN 1 ELSE 0 END),0) AS missing,COALESCE(SUM(CASE WHEN COALESCE(s.state,'DIRTY')='DIRTY' THEN 1 ELSE 0 END),0) AS dirty,COALESCE(SUM(CASE WHEN s.state='IN_PROGRESS' THEN 1 ELSE 0 END),0) AS cleaning,COALESCE(SUM(CASE WHEN s.state='INSPECTION' THEN 1 ELSE 0 END),0) AS inspection,COALESCE(SUM(CASE WHEN s.state='CLEAN' THEN 1 ELSE 0 END),0) AS clean,COALESCE(SUM(CASE WHEN EXISTS(SELECT 1 FROM maintenance_blocks b WHERE b.property_id=a.property_id AND b.room_id=a.id AND b.status='ACTIVE' AND b.start_date<=? AND b.end_date>?) THEN 1 ELSE 0 END),0) AS blocked FROM apartments a LEFT JOIN room_readiness s ON s.property_id=a.property_id AND s.room_id=a.id WHERE a.property_id=? AND a.active=TRUE",
                today,
                today,
                PropertyScope.ID,
            )
        val finance =
            jdbc.queryForMap(
                "SELECT COALESCE(SUM(CASE WHEN (${ReportMoney.OUTSTANDING})>0 THEN 1 ELSE 0 END),0) AS outstanding_count,COALESCE(SUM(${ReportMoney.OUTSTANDING}),0) AS outstanding,COALESCE(SUM(CASE WHEN (${ReportMoney.CREDIT})>0 THEN 1 ELSE 0 END),0) AS credit_count,COALESCE(SUM(${ReportMoney.CREDIT}),0) AS credit,COALESCE(SUM(CASE WHEN p.id IS NULL THEN 1 ELSE 0 END),0) AS unknown_count FROM reservations r ${ReportMoney.JOINS} WHERE r.property_id=?",
                PropertyScope.ID,
            )
        val balances =
            jdbc.query(
                "SELECT r.id,r.stay_phase,r.start_date,r.end_date,CONCAT(c.first_name,' ',c.last_name) AS guest_name,${ReportMoney.FIELDS},(${ReportMoney.INVALID_SOURCE}) AS invalid_source FROM reservations r JOIN customers c ON c.property_id=r.property_id AND c.id=r.customer_id ${ReportMoney.JOINS} WHERE r.property_id=? AND (p.id IS NULL OR (${ReportMoney.OUTSTANDING})>0 OR (${ReportMoney.CREDIT})>0) ORDER BY CASE WHEN p.id IS NULL THEN 0 ELSE 1 END,(${ReportMoney.OUTSTANDING}) DESC,(${ReportMoney.CREDIT}) DESC,r.id LIMIT 5",
                { r, _ -> ReportMoney.balance(r) },
                PropertyScope.ID,
            )
        fun count(values: Map<String, Any?>, key: String) =
            (values.getValue(key) as Number).toLong()
        fun cents(key: String) =
            ReportMoney.exact((finance.getValue(key) as Number).toString().toBigDecimal())
        return TodayView(
            today.toString(),
            now.toString(),
            arrivals,
            departures,
            inHouse,
            attention,
            guests,
            count(rooms, "total"),
            count(rooms, "missing"),
            count(rooms, "dirty"),
            count(rooms, "cleaning"),
            count(rooms, "inspection"),
            count(rooms, "clean"),
            count(rooms, "blocked"),
            TodayBalances(
                count(finance, "outstanding_count"),
                cents("outstanding"),
                count(finance, "credit_count"),
                cents("credit"),
                count(finance, "unknown_count"),
                balances,
            ),
        )
    }
}
