package com.villarosa

import com.villarosa.service.QuoteService
import com.villarosa.service.ReservationService
import java.util.concurrent.ConcurrentHashMap
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate

class ReviewedChanges(
    private val inventory: ReservationService,
    private val quotes: QuoteService,
    manager: PlatformTransactionManager,
) {
    private data class Review(val quoteId: String?)

    private val reviews = ConcurrentHashMap<List<String>, Review>()
    private val transactions =
        TransactionTemplate(manager).apply {
            propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
            isolationLevel = TransactionDefinition.ISOLATION_READ_COMMITTED
        }

    fun move(id: Int, room: Int, version: Long?, key: String) =
        inventory.move(
            id,
            room,
            version,
            key,
            review("MOVE", key) {
                val current = inventory.reservation(id)
                if (current.roomId == room) null
                else
                    quotes
                        .create(room, current.startDate!!, current.endDate!!, current.guestCount)
                        .id
            },
        )

    fun change(id: Int, start: String, end: String, count: Int, version: Long, key: String) =
        inventory.change(
            id,
            start,
            end,
            count,
            version,
            key,
            review("CHANGE", key) {
                val current = inventory.reservation(id)
                if (
                    current.startDate == start &&
                        current.endDate == end &&
                        current.guestCount == count
                )
                    null
                else quotes.create(current.roomId!!, start, end, count).id
            },
        )

    private fun review(kind: String, key: String, prepare: () -> String?): String? =
        reviews
            .computeIfAbsent(
                listOf(
                    SecurityContextHolder.getContext().authentication?.name ?: "anonymous",
                    kind,
                    key,
                )
            ) {
                checkNotNull(transactions.execute { Review(prepare()) })
            }
            .quoteId
}
