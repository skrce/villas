package com.villarosa.exception

import io.swagger.v3.oas.annotations.media.Schema
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.HttpStatusCode
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.ResponseBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.context.request.WebRequest
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler

@ControllerAdvice
class ExceptionHandler : ResponseEntityExceptionHandler() {
    @ExceptionHandler(DomainException::class)
    fun domainFailure(exception: DomainException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(exception.status)
            .body(
                ErrorResponse(
                    exception.message,
                    exception.code,
                    exception.relatedReservationIds,
                    exception.moreReservations,
                    exception.replacementQuote,
                )
            )

    @ExceptionHandler(org.springframework.dao.OptimisticLockingFailureException::class)
    fun staleWrite(): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.CONFLICT)
            .body(ErrorResponse("The record changed. Reload it before editing.", "STALE_VERSION"))

    @ExceptionHandler(org.springframework.dao.PessimisticLockingFailureException::class)
    fun lockedWrite(): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.CONFLICT)
            .body(
                ErrorResponse(
                    "Inventory changed. Reconcile or retry with the same operation key.",
                    "INVENTORY_RETRYABLE",
                )
            )

    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException::class)
    fun invalidWrite(): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.CONFLICT)
            .body(ErrorResponse("The requested change conflicts with saved data.", "DATA_CONFLICT"))

    @ExceptionHandler(value = [IllegalArgumentException::class, ClientException::class])
    @ResponseStatus(code = HttpStatus.BAD_REQUEST)
    @ResponseBody
    fun handleClientException(exception: RuntimeException): ErrorResponse {
        return ErrorResponse(exception.message ?: "Invalid request.")
    }

    override fun handleExceptionInternal(
        ex: Exception,
        body: Any?,
        headers: HttpHeaders,
        statusCode: HttpStatusCode,
        request: WebRequest,
    ): ResponseEntity<Any> =
        ResponseEntity.status(statusCode)
            .headers(headers)
            .body(
                ErrorResponse(
                    HttpStatus.resolve(statusCode.value())?.reasonPhrase ?: "Request failed.",
                    "HTTP_${statusCode.value()}",
                )
            )

    data class ErrorResponse(
        @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val message: String,
        @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
        val code: String = "INVALID_REQUEST",
        val relatedReservationIds: List<Int>? = null,
        val moreReservations: Boolean? = null,
        val replacementQuote: com.villarosa.service.BookingQuote? = null,
    )

    data class ClientException(override val message: String) : RuntimeException()
}
