package com.villarosa

import com.villarosa.security.AuthenticationSettings
import com.villarosa.security.StaffSessionFilter
import jakarta.servlet.http.Cookie
import java.time.Instant
import java.util.Base64
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.session.Session
import org.springframework.session.SessionRepository
import org.springframework.session.jdbc.JdbcIndexedSessionRepository
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import tools.jackson.databind.json.JsonMapper

data class TestHttpSession(val cookie: Cookie, val csrf: String) {
    companion object {
        @Suppress("UNCHECKED_CAST")
        fun create(
            repository: JdbcIndexedSessionRepository,
            mvc: MockMvc,
            principal: com.villarosa.security.StaffSessionIdentity? = null,
        ): TestHttpSession {
            val store = repository as SessionRepository<Session>
            val context =
                SecurityContextHolder.createEmptyContext().apply {
                    authentication =
                        principal?.let { com.villarosa.security.StaffAuthentication(it) }
                            ?: TestData.authentication(TestData.ownerIdentity())
                }
            val session = store.createSession()
            session.maxInactiveInterval = AuthenticationSettings.IDLE_LIMIT
            session.setAttribute(
                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
                context,
            )
            session.setAttribute(StaffSessionFilter.AUTHENTICATED_AT, Instant.now().toEpochMilli())
            session.setAttribute(StaffSessionFilter.LAST_SEEN_AT, Instant.now().toEpochMilli())
            session.setAttribute(
                StaffSessionFilter.GENERATION,
                java.util.UUID.randomUUID().toString(),
            )
            store.save(session)
            val cookie =
                Cookie(
                    "VILLAS_LOCAL_SESSION",
                    Base64.getEncoder().encodeToString(session.id.toByteArray()),
                )
            val response =
                mvc.perform(get("/api/v1/auth/session").cookie(cookie))
                    .andExpect(status().isOk)
                    .andReturn()
                    .response
            return TestHttpSession(
                cookie,
                JsonMapper.builder()
                    .build()
                    .readTree(response.contentAsString)
                    .get("csrfToken")
                    .asString(),
            )
        }
    }
}
