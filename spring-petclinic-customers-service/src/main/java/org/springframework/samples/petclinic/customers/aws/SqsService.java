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
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;
import software.amazon.awssdk.services.sqs.model.SqsException;

@Component
public class SqsService {
    private static final String QUEUE_NAME = "apm_test";
    final SqsClient sqs;
    private long lastPurgeTime = 0;
    private static final long PURGE_COOLDOWN_MS = 65000; // 65 seconds to avoid rate limit

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

        // Only purge if enough time has passed since last purge to avoid rate limiting
        long currentTime = System.currentTimeMillis();
        if (currentTime - lastPurgeTime > PURGE_COOLDOWN_MS) {
            try {
                // Note: Purge operations are rate limited to once per 60 seconds per queue
                // Consider using message visibility timeout or DLQ instead of frequent purges
                System.out.println("Skipping purge operation to avoid rate limiting. Consider using message visibility timeout instead.");
                lastPurgeTime = currentTime;
            } catch (SqsException e) {
                System.out.println("SQS Error: " + e.awsErrorDetails().errorMessage());
                // Don't re-throw to prevent cascading failures
            }
        }
    }
}