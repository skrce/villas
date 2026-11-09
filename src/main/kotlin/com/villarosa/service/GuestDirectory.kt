package com.villarosa.service

import com.villarosa.exception.invalid
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.model.Customer
import jakarta.persistence.criteria.CriteriaBuilder
import jakarta.persistence.criteria.Expression
import jakarta.persistence.criteria.Root
import java.util.Locale
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Component

@Component
class GuestDirectory(private val guests: CustomerRepository) {
    fun query(
        name: String?,
        phone: String?,
        includeArchived: Boolean,
        after: Int,
        limit: Int,
        firstOnly: Boolean = false,
    ): GuestPage {
        if (after < 0) invalid("INVALID_CURSOR", "Cursor must not be negative.")
        if (limit !in 1..100) invalid("INVALID_PAGE_SIZE", "Limit must be between 1 and 100.")
        val words = GuestProfile.optional(name, 200)?.lowercase(Locale.ROOT)?.split(" ").orEmpty()
        val digits = GuestProfile.phone(phone)?.removePrefix("+")
        val specification =
            Specification<Customer> { root, _, cb ->
                val filters =
                    mutableListOf(
                        cb.equal(root.get<String>("propertyId"), PropertyScope.ID),
                        cb.greaterThan(root.get("id"), after),
                    )
                if (!includeArchived) filters += cb.isTrue(root.get("active"))
                val fullName =
                    if (firstOnly) root.get<String>("firstName")
                    else cb.concat(cb.concat(root.get("firstName"), " "), root.get("lastName"))
                words.forEach { filters += cb.like(cb.lower(fullName), "%${escape(it)}%", '!') }
                if (digits != null)
                    filters += cb.like(phoneExpression(root, cb), "%${escape(digits)}%", '!')
                cb.and(*filters.toTypedArray())
            }
        val rows =
            guests.findAll(specification, PageRequest.of(0, limit + 1, Sort.by("id"))).content
        val items = rows.take(limit)
        return GuestPage(items, if (rows.size > limit) items.last().id else null)
    }

    fun duplicates(profile: GuestProfile, exactNamesOnly: Boolean = false): List<Customer> {
        val specification =
            Specification<Customer> { root, _, cb ->
                val names =
                    cb.and(
                        cb.equal(
                            cb.lower(root.get("firstName")),
                            profile.firstName.lowercase(Locale.ROOT),
                        ),
                        cb.equal(
                            cb.lower(root.get("lastName")),
                            profile.lastName.lowercase(Locale.ROOT),
                        ),
                    )
                val matches = mutableListOf(names)
                if (!exactNamesOnly) {
                    profile.phone?.let {
                        matches += cb.equal(phoneExpression(root, cb), it.removePrefix("+"))
                    }
                    profile.email?.let { matches += cb.equal(cb.lower(root.get("email")), it) }
                }
                cb.and(
                    cb.equal(root.get<String>("propertyId"), PropertyScope.ID),
                    cb.or(*matches.toTypedArray()),
                )
            }
        return guests.findAll(specification, PageRequest.of(0, 20, Sort.by("id"))).content
    }

    private fun phoneExpression(root: Root<Customer>, cb: CriteriaBuilder): Expression<String> {
        val compact =
            cb.function(
                "translate",
                String::class.java,
                cb.coalesce(root.get("phone"), ""),
                cb.literal(
                    " \t\n\r\u000B\u000C\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000().-"
                ),
                cb.literal(""),
            )
        val normalizedPrefix =
            cb.selectCase<String>()
                .`when`(cb.like(compact, "00%"), cb.substring(compact, 3))
                .otherwise(compact)
        return cb.function(
            "replace",
            String::class.java,
            normalizedPrefix,
            cb.literal("+"),
            cb.literal(""),
        )
    }

    private fun escape(value: String) =
        value.replace("!", "!!").replace("%", "!%").replace("_", "!_")
}
