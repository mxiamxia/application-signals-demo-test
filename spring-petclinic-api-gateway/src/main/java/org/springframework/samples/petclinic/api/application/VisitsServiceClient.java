/*
 * Copyright 2002-2021 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Modifications Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
package org.springframework.samples.petclinic.api.application;

import io.opentelemetry.api.trace.Span;
import io.opentelemetry.instrumentation.annotations.SpanAttribute;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.instrumentation.annotations.WithSpan;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.samples.petclinic.api.dto.VisitDetails;
import org.springframework.samples.petclinic.api.dto.Visits;
import org.springframework.samples.petclinic.api.utils.WellKnownAttributes;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeoutException;

import static java.util.stream.Collectors.joining;

/**
 * @author Maciej Szarlinski
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class VisitsServiceClient {

    // Could be changed for testing purpose
    private String hostname = "http://visits-service/";
    
    // Configuration for resilience
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(10);
    private static final int MAX_RETRY_ATTEMPTS = 3;
    private static final Duration RETRY_BACKOFF = Duration.ofMillis(500);

    private final WebClient.Builder webClientBuilder;

    @WithSpan
    public Mono<Visits> getVisitsForPets(final List<Integer> petIds) {
        Span.current().setAttribute("aws.local.service", "pet-clinic-frontend-java");
        
        return webClientBuilder.build()
            .get()
            .uri(hostname + "pets/visits?petId={petId}", joinIds(petIds))
            .retrieve()
            .bodyToMono(Visits.class)
            .timeout(REQUEST_TIMEOUT)
            .retryWhen(Retry.backoff(MAX_RETRY_ATTEMPTS, RETRY_BACKOFF)
                .filter(this::isRetryableException)
                .onRetryExhaustedThrow((retryBackoffSpec, retrySignal) -> {
                    log.error("Retry exhausted for getVisitsForPets after {} attempts", retrySignal.totalRetries());
                    return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, 
                        "Visits service unavailable after retries");
                }))
            .onErrorResume(this::handleError);
    }

    @WithSpan
    public Mono<Visits> getVisitsForOwnersPets(@SpanAttribute(WellKnownAttributes.OWNER_ID) final int ownerId, 
                                               @SpanAttribute(WellKnownAttributes.PET_ID) final int petId) {
        Span.current().setAttribute("aws.local.service", "pet-clinic-frontend-java");
        
        return webClientBuilder.build()
            .get()
            .uri(hostname + "owners/{ownerId}/pets/{petId}/visits", ownerId, petId)
            .retrieve()
            .bodyToMono(Visits.class)
            .timeout(REQUEST_TIMEOUT)
            .retryWhen(Retry.backoff(MAX_RETRY_ATTEMPTS, RETRY_BACKOFF)
                .filter(this::isRetryableException)
                .onRetryExhaustedThrow((retryBackoffSpec, retrySignal) -> {
                    log.error("Retry exhausted for getVisitsForOwnersPets ownerId={}, petId={} after {} attempts", 
                        ownerId, petId, retrySignal.totalRetries());
                    return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, 
                        "Visits service unavailable after retries");
                }))
            .onErrorResume(this::handleError);
    }

    @WithSpan
    public Mono<String> addVisitForOwnersPets(@SpanAttribute(WellKnownAttributes.OWNER_ID) final int ownerId, 
                                              @SpanAttribute(WellKnownAttributes.PET_ID) final int petId, 
                                              final VisitDetails visitDetails) {
        Span.current().setAttribute("aws.local.service", "pet-clinic-frontend-java");
        
        return webClientBuilder.build()
            .post()
            .uri(hostname + "owners/{ownerId}/pets/{petId}/visits", ownerId, petId)
            .body(Mono.just(visitDetails), VisitDetails.class)
            .retrieve()
            .bodyToMono(String.class)
            .timeout(REQUEST_TIMEOUT)
            .retryWhen(Retry.backoff(MAX_RETRY_ATTEMPTS, RETRY_BACKOFF)
                .filter(this::isRetryableException)
                .onRetryExhaustedThrow((retryBackoffSpec, retrySignal) -> {
                    log.error("Retry exhausted for addVisitForOwnersPets ownerId={}, petId={} after {} attempts", 
                        ownerId, petId, retrySignal.totalRetries());
                    return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, 
                        "Visits service unavailable after retries");
                }))
            .onErrorResume(WebClientResponseException.class, ex -> {
                log.error("WebClient error in addVisitForOwnersPets: status={}, body={}", 
                    ex.getRawStatusCode(), ex.getResponseBodyAsString());
                if (ex.getRawStatusCode() == 400) {
                    return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getResponseBodyAsString()));
                } else {
                    return Mono.error(ex);
                }
            })
            .onErrorResume(this::handleError);
    }
    
    private boolean isRetryableException(Throwable throwable) {
        if (throwable instanceof WebClientResponseException) {
            WebClientResponseException ex = (WebClientResponseException) throwable;
            int status = ex.getRawStatusCode();
            // Retry on 5xx server errors and 429 Too Many Requests, but not on 4xx client errors
            return status >= 500 || status == 429;
        }
        // Retry on timeout and connection issues
        return throwable instanceof TimeoutException || 
               throwable.getCause() instanceof java.net.ConnectException ||
               throwable.getCause() instanceof java.net.SocketTimeoutException;
    }
    
    private <T> Mono<T> handleError(Throwable throwable) {
        if (throwable instanceof WebClientResponseException) {
            WebClientResponseException ex = (WebClientResponseException) throwable;
            log.error("WebClient error: status={}, message={}", ex.getRawStatusCode(), ex.getMessage());
            
            if (ex.getRawStatusCode() >= 500) {
                return Mono.error(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, 
                    "Visits service temporarily unavailable"));
            } else if (ex.getRawStatusCode() == 404) {
                return Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, 
                    "Requested resource not found"));
            }
        } else if (throwable instanceof TimeoutException) {
            log.error("Request timeout: {}", throwable.getMessage());
            return Mono.error(new ResponseStatusException(HttpStatus.REQUEST_TIMEOUT, 
                "Request timed out"));
        } else {
            log.error("Unexpected error: {}", throwable.getMessage(), throwable);
        }
        
        return Mono.error(throwable);
    }

    private String joinIds(List<Integer> petIds) {
        return petIds.stream().map(Object::toString).collect(joining(","));
    }

    void setHostname(String hostname) {
        this.hostname = hostname;
    }
}