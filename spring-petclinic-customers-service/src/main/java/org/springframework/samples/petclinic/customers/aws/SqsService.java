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
import software.amazon.awssdk.services.sqs.model.QueueDoesNotExistException;
import software.amazon.awssdk.services.sqs.model.SqsException;

@Component
public class SqsService {
    private static final String QUEUE_NAME = "apm_test";
    private static final int MAX_RETRIES = 3;
    private static final long INITIAL_BACKOFF_MS = 100;
    final SqsClient sqs;
    private volatile String cachedQueueUrl;

    public SqsService() {
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
            cachedQueueUrl = createResult.queueUrl();
        } catch (SqsException e) {
            if (e.awsErrorDetails().errorCode().equals("QueueAlreadyExists")) {
                try {
                    cachedQueueUrl = sqs.getQueueUrl(GetQueueUrlRequest.builder().queueName(QUEUE_NAME).build()).queueUrl();
                } catch (QueueDoesNotExistException queueEx) {
                    System.err.println("Queue " + QUEUE_NAME + " does not exist and could not be created. Please verify queue configuration.");
                    cachedQueueUrl = null;
                }
            } else {
                System.err.println("Failed to create or retrieve queue: " + e.awsErrorDetails().errorMessage());
                cachedQueueUrl = null;
            }
        }
    }

    public void sendMsg() {
        String queueUrl = getQueueUrlWithRetry();
        if (queueUrl == null) {
            System.err.println("Skipping message send - queue URL unavailable");
            return;
        }

        int retries = 0;
        while (retries < MAX_RETRIES) {
            try {
                SendMessageRequest sendMsgRequest = SendMessageRequest.builder()
                    .queueUrl(queueUrl)
                    .messageBody("hello world")
                    .delaySeconds(5)
                    .build();
                sqs.sendMessage(sendMsgRequest);

                PurgeQueueRequest purgeReq = PurgeQueueRequest.builder().queueUrl(queueUrl).build();
                try {
                    sqs.purgeQueue(purgeReq);
                } catch (SqsException e) {
                    System.out.println("Purge queue warning: " + e.awsErrorDetails().errorMessage());
                }
                return;
            } catch (QueueDoesNotExistException e) {
                System.err.println("Queue does not exist on attempt " + (retries + 1) + ": " + e.awsErrorDetails().errorMessage());
                cachedQueueUrl = null;
                queueUrl = getQueueUrlWithRetry();
                if (queueUrl == null) {
                    System.err.println("Unable to recover queue URL, aborting send operation");
                    return;
                }
            } catch (SqsException e) {
                retries++;
                if (retries >= MAX_RETRIES) {
                    System.err.println("Failed to send message after " + MAX_RETRIES + " retries: " + e.awsErrorDetails().errorMessage());
                    return;
                }
                long backoff = INITIAL_BACKOFF_MS * (long) Math.pow(2, retries - 1);
                System.err.println("Retrying message send after " + backoff + "ms (attempt " + retries + ")");
                try {
                    Thread.sleep(backoff);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    System.err.println("Interrupted during retry backoff");
                    return;
                }
            }
        }
    }

    private String getQueueUrlWithRetry() {
        if (cachedQueueUrl != null) {
            return cachedQueueUrl;
        }

        int retries = 0;
        while (retries < MAX_RETRIES) {
            try {
                cachedQueueUrl = sqs.getQueueUrl(GetQueueUrlRequest.builder().queueName(QUEUE_NAME).build()).queueUrl();
                return cachedQueueUrl;
            } catch (QueueDoesNotExistException e) {
                System.err.println("Queue " + QUEUE_NAME + " does not exist on retrieval attempt " + (retries + 1));
                retries++;
                if (retries >= MAX_RETRIES) {
                    System.err.println("Queue " + QUEUE_NAME + " does not exist after " + MAX_RETRIES + " attempts. Please create the queue or check configuration.");
                    return null;
                }
                long backoff = INITIAL_BACKOFF_MS * (long) Math.pow(2, retries - 1);
                try {
                    Thread.sleep(backoff);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return null;
                }
            } catch (SqsException e) {
                System.err.println("Error retrieving queue URL: " + e.awsErrorDetails().errorMessage());
                return null;
            }
        }
        return null;
    }

}
