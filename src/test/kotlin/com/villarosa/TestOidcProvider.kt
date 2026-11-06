package com.villarosa

import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.Base64
import java.util.Date
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

class TestOidcProvider(private val callback: String) : AutoCloseable {
    private val key = RSAKeyGenerator(2048).keyID("synthetic-test").generate()
    private val wrongKey = RSAKeyGenerator(2048).keyID("wrong-test").generate()
    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
    private val executor = Executors.newCachedThreadPool()
    private val codes = ConcurrentHashMap<String, Map<String, String>>()
    val fault = AtomicReference("")
    val issuer: String
        get() = "http://localhost:${server.address.port}"

    init {
        server.executor = executor
        server.createContext("/jwks") { exchange ->
            reply(exchange, 200, JWKSet(key.toPublicJWK()).toString())
        }
        server.createContext("/authorize") { exchange ->
            val query = params(exchange.requestURI.rawQuery.orEmpty())
            if (
                query["client_id"] != CLIENT ||
                    query["redirect_uri"] != callback ||
                    query["nonce"].isNullOrBlank() ||
                    query["state"].isNullOrBlank()
            )
                reply(exchange, 400, "{}")
            else {
                val code = UUID.randomUUID().toString()
                codes[code] = query
                exchange.responseHeaders.set(
                    "Location",
                    "$callback?code=$code&state=${encode(query.getValue("state"))}",
                )
                exchange.sendResponseHeaders(302, -1)
                exchange.close()
            }
        }
        server.createContext("/token") { exchange ->
            val authorization =
                "Basic " +
                    Base64.getEncoder()
                        .encodeToString("$CLIENT:$SECRET".toByteArray(StandardCharsets.UTF_8))
            val form =
                params(String(exchange.requestBody.readNBytes(16384), StandardCharsets.UTF_8))
            val request = codes.remove(form["code"])
            if (
                exchange.requestHeaders.getFirst("Authorization") != authorization ||
                    request == null ||
                    form["redirect_uri"] != callback
            )
                reply(exchange, 400, "{\"error\":\"invalid_grant\"}")
            else {
                val persona = request["identity"] ?: "owner"
                val email =
                    when (persona) {
                        "uninvited" -> "uninvited@example.test"
                        "second" -> "second-owner@example.test"
                        else -> "owner@example.test"
                    }
                val subject =
                    when (persona) {
                        "uninvited" -> "synthetic-uninvited"
                        "second" -> "synthetic-second-owner"
                        else -> "synthetic-owner"
                    }
                val now = Instant.now()
                val defect = fault.get()
                val claims =
                    JWTClaimsSet.Builder()
                        .issuer(if (defect == "issuer") "https://wrong.invalid" else issuer)
                        .subject(subject)
                        .audience(if (defect == "audience") "wrong-client" else CLIENT)
                        .issueTime(Date.from(now.minusSeconds(5)))
                        .expirationTime(
                            Date.from(
                                if (defect == "expired") now.minusSeconds(120)
                                else now.plusSeconds(300)
                            )
                        )
                        .claim("email", email)
                        .claim("email_verified", persona != "unverified")
                        .claim(
                            "nonce",
                            if (defect == "nonce") "wrong-nonce" else request.getValue("nonce"),
                        )
                        .claim("roles", listOf("OWNER"))
                        .build()
                val token =
                    SignedJWT(
                        JWSHeader.Builder(JWSAlgorithm.RS256)
                            .type(JOSEObjectType.JWT)
                            .keyID(key.keyID)
                            .build(),
                        claims,
                    )
                token.sign(RSASSASigner(if (defect == "signature") wrongKey else key))
                reply(
                    exchange,
                    200,
                    """{"access_token":"synthetic-unused","token_type":"Bearer","expires_in":300,"scope":"openid email profile","id_token":"${token.serialize()}"}""",
                )
            }
        }
        server.start()
    }

    private fun reply(exchange: HttpExchange, status: Int, body: String) {
        val bytes = body.toByteArray(StandardCharsets.UTF_8)
        exchange.responseHeaders.set("Content-Type", "application/json")
        exchange.responseHeaders.set("Cache-Control", "no-store")
        exchange.sendResponseHeaders(status, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
        exchange.close()
    }

    override fun close() {
        server.stop(0)
        executor.shutdownNow()
    }

    companion object {
        const val CLIENT = "villas-test"
        const val SECRET = "synthetic-secret"

        fun port(): Int =
            java.net.ServerSocket(0, 0, java.net.InetAddress.getByName("127.0.0.1")).use {
                it.localPort
            }

        fun encode(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8)

        fun params(value: String): Map<String, String> =
            value
                .split('&')
                .filter { it.isNotBlank() }
                .associate {
                    val pair = it.split('=', limit = 2)
                    URLDecoder.decode(pair[0], StandardCharsets.UTF_8) to
                        URLDecoder.decode(pair.getOrElse(1) { "" }, StandardCharsets.UTF_8)
                }
    }
}
