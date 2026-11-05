package com.villarosa.exception

import org.springframework.http.HttpStatus

class DomainException(val code: String, val status: HttpStatus, override val message: String) :
    RuntimeException(message)

fun invalid(code: String, message: String): Nothing =
    throw DomainException(code, HttpStatus.BAD_REQUEST, message)

fun missing(message: String): Nothing =
    throw DomainException("NOT_FOUND", HttpStatus.NOT_FOUND, message)

fun conflict(code: String, message: String): Nothing =
    throw DomainException(code, HttpStatus.CONFLICT, message)
