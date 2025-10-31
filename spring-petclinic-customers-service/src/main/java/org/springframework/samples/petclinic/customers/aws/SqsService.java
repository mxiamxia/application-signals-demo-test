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
import java.util.concurrent.atomic.AtomicLong;

@Component
public class SqsService {
    private static final String QUEUE_NAME = "apm_test";
    private static final long PURGE_COOLDOWN_SECONDS = 60;
    
    final SqsClient sqs;
    
    // Thread-safe tracking of last purge time per queue
    private final ConcurrentHashMap<String, AtomicLong> lastPurgeTime = new ConcurrentHashMap<>();

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

        // Check if we can purge the queue (respecting 60-second cooldown)
        if (canPurgeQueue(queueUrl)) {
            PurgeQueueRequest purgeReq = PurgeQueueRequest.builder().queueUrl(queueUrl).build();
            try {
                sqs.purgeQueue(purgeReq);
                // Update last purge time on successful purge
                updateLastPurgeTime(queueUrl);
                System.out.println("Queue purged successfully");
            } catch (SqsException e) {
                if (e.awsErrorDetails().errorCode().equals("PurgeQueueInProgress")) {
                    System.out.println("Purge operation already in progress, skipping purge request");
                    // Update our tracking to prevent immediate retry
                    updateLastPurgeTime(queueUrl);
                } else {
                    System.out.println("Purge failed: " + e.awsErrorDetails().errorMessage());
                    throw e;
                }
            }
        } else {
            System.out.println("Skipping purge - within 60-second cooldown period");
        }
    }
    
    private boolean canPurgeQueue(String queueUrl) {
        AtomicLong lastPurge = lastPurgeTime.get(queueUrl);
        if (lastPurge == null) {
            return true; // Never purged before
        }
        
        long currentTime = Instant.now().getEpochSecond();
        long timeSinceLastPurge = currentTime - lastPurge.get();
        
        return timeSinceLastPurge >= PURGE_COOLDOWN_SECONDS;
    }
    
    private void updateLastPurgeTime(String queueUrl) {
        long currentTime = Instant.now().getEpochSecond();
        lastPurgeTime.computeIfAbsent(queueUrl, k -> new AtomicLong()).set(currentTime);
    }
}