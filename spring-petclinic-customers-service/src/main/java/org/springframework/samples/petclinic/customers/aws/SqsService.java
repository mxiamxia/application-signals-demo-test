// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package org.springframework.samples.petclinic.customers.aws;

import org.springframework.samples.petclinic.customers.Util;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.WebIdentityTokenFileCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.CreateQueueRequest;
import software.amazon.awssdk.services.sqs.model.CreateQueueResponse;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.PurgeQueueRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;
import software.amazon.awssdk.services.sqs.model.SqsException;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class SqsService {
    private static final String QUEUE_NAME = "apm_test";
    private static final long PURGE_COOLDOWN_SECONDS = 61; // AWS requires 60 seconds, add 1 for safety
    private static final Logger logger = LoggerFactory.getLogger(SqsService.class);
    
    private final SqsClient sqs;
    private final ConcurrentHashMap<String, Instant> lastPurgeTimestamps = new ConcurrentHashMap<>();

    public SqsService() {
        // AWS web identity is set for EKS clusters, if these are not set then use default credentials
        if (System.getenv("REGION_FROM_ECS") != null) {
            String regionName = System.getenv("REGION_FROM_ECS");
            sqs = SqsClient.builder()
                .region(Region.of(regionName))
                .build();
        }
        else if (System.getenv("AWS_WEB_IDENTITY_TOKEN_FILE") == null && System.getProperty("aws.webIdentityTokenFile") == null) {
            sqs = SqsClient.builder()
                .region(Region.of(Util.REGION_FROM_EC2))
                .build();
        }
        else {
            sqs = SqsClient.builder()
                .region(Region.of(Util.REGION_FROM_EKS))
                .credentialsProvider(WebIdentityTokenFileCredentialsProvider.create())
                .build();
        }

        try {
            CreateQueueResponse createResult = sqs.createQueue(CreateQueueRequest.builder().queueName(QUEUE_NAME).build());
        } catch (SqsException e) {
            if (!e.awsErrorDetails().errorCode().equals("QueueAlreadyExists")) {
                throw e;
            }
        }
    }

    public void sendMsg() {
        String queueUrl = sqs.getQueueUrl(GetQueueUrlRequest.builder().queueName(QUEUE_NAME).build()).queueUrl();

        SendMessageRequest sendMsgRequest = SendMessageRequest.builder()
            .queueUrl(queueUrl)
            .messageBody("hello world")
            .delaySeconds(5)
            .build();
        sqs.sendMessage(sendMsgRequest);

        purgeQueueWithRateLimit(queueUrl);
    }

    private void purgeQueueWithRateLimit(String queueUrl) {
        Instant now = Instant.now();
        Instant lastPurge = lastPurgeTimestamps.get(queueUrl);
        
        if (lastPurge != null) {
            long secondsSinceLastPurge = now.getEpochSecond() - lastPurge.getEpochSecond();
            
            if (secondsSinceLastPurge < PURGE_COOLDOWN_SECONDS) {
                logger.info("Skipping purgeQueue operation - only {} seconds since last purge (requires {} seconds cooldown)", 
                    secondsSinceLastPurge, PURGE_COOLDOWN_SECONDS);
                return;
            }
        }
        
        PurgeQueueRequest purgeReq = PurgeQueueRequest.builder().queueUrl(queueUrl).build();
        try {
            sqs.purgeQueue(purgeReq);
            lastPurgeTimestamps.put(queueUrl, now);
            logger.info("Successfully purged queue: {}", queueUrl);
        } catch (SqsException e) {
            String errorCode = e.awsErrorDetails().errorCode();
            String errorMessage = e.awsErrorDetails().errorMessage();
            
            if ("PurgeQueueInProgress".equals(errorCode)) {
                logger.warn("PurgeQueue already in progress for queue: {} - {}", queueUrl, errorMessage);
                lastPurgeTimestamps.put(queueUrl, now);
            } else {
                logger.error("Failed to purge queue: {} - Error: {} - {}", queueUrl, errorCode, errorMessage);
                throw e;
            }
        }
    }

}