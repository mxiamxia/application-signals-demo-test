# Lambda Audit Service

This directory contains a CDK implementation of a Lambda function that processes payment audit information. It is triggered by messages in an SQS queue named `audit-jobs` and uses OpenTelemetry for observability with **AWS Application Signals** enabled.

## Architecture

The CDK stack provisions the following AWS resources:

- **SQS Queue**: `audit-jobs` - Main queue for processing payment audit messages
- **SQS Queue**: `audit-jobs-dlq` - Dead letter queue for failed messages
- **Lambda Function**: `audit-service` - Processes audit messages from the SQS queue
- **IAM Role**: `lambda_exec_role_audit_service` - Role for Lambda execution

The Lambda function is configured with:
- **Python 3.13 runtime** (upgraded for better compatibility)
- **OpenTelemetry layer v5** for AWS Application Signals integration
- **X-Ray tracing enabled** for distributed tracing
- **Application Signals environment variables** for enhanced observability
- 600 second (10 minute) timeout
- SQS event source with batch size of 1

## AWS Application Signals Integration

This Lambda function is fully integrated with **AWS Application Signals** providing:

### ✅ Enabled Features
- **Automatic service discovery** - Function appears in Application Signals service map
- **Performance metrics** - Latency, throughput, and error rate monitoring
- **Distributed tracing** - End-to-end request tracing across services
- **Custom attributes** - Business context like `owner.id` and `order.id`
- **SLO monitoring** - Service Level Objectives for reliability tracking
- **Dependency mapping** - Automatic detection of DynamoDB and SQS dependencies

### Configuration Details
- **OpenTelemetry Layer**: Version 5 (latest) with region-specific ARNs
- **IAM Policy**: `CloudWatchLambdaApplicationSignalsExecutionRolePolicy`
- **Service Name**: `audit-service` (configurable via `OTEL_SERVICE_NAME`)
- **Tracing**: X-Ray active tracing enabled
- **Propagation**: Supports trace context, baggage, and X-Ray propagation

## Prerequisites

- Node.js 16+ installed
- AWS CLI configured with appropriate credentials
- AWS CDK installed (`npm install -g aws-cdk`)
- **AWS Application Signals enabled** in your AWS account and region

## Deployment Instructions

### Step 1: Install Dependencies and Package Lambda

```bash
# Navigate to the CDK directory
cd cdk

# Install CDK dependencies (if needed)
npm install
```

### Step 2: Deploy the CDK Stack

```bash
# Build and deploy the stack
./cdk.sh deploy
```

This script will:
1. Package the Lambda function
2. Bootstrap your AWS environment for CDK (if needed)
3. Synthesize the CloudFormation template
4. Deploy the stack with Application Signals configuration

### Step 3: Verify the Deployment

Verify that the resources were created successfully in your AWS account:

```bash
# Verify Lambda function
aws lambda get-function --function-name audit-service

# Verify SQS queue
aws sqs get-queue-url --queue-name audit-jobs

# Check Application Signals integration
aws lambda get-function-configuration --function-name audit-service \
  --query 'Environment.Variables'
```

## Testing the Lambda Function

To test the Lambda function, you will need to:

1. Create a DynamoDB table named `PetClinicPayment` with `id` as the primary key:

> **Note:** The DynamoDB table might already be created by the `dotnet-petclinic-payment` service which automatically creates this table on startup if it doesn't exist. You can check if the table exists using:
> ```bash
> aws dynamodb describe-table --table-name PetClinicPayment
> ```
> If the table doesn't exist, create it with:
> ```bash
> aws dynamodb create-table \
>   --table-name PetClinicPayment \
>   --attribute-definitions AttributeName=id,AttributeType=S \
>   --key-schema AttributeName=id,KeyType=HASH \
>   --billing-mode PAY_PER_REQUEST
> ```
> Reference: `/dotnet-petclinic-payment/PetClinic.PaymentService/PetClinicContext.cs` (lines 36-102)

2. Add a test item to the table:
```bash
aws dynamodb put-item \
  --table-name PetClinicPayment \
  --item '{"id": {"S": "test-123"}, "owner_id": {"S": "owner-456"}, "amount": {"N": "50"}}'
```

3. Send a test message to the SQS queue:
```bash
aws sqs send-message \
  --queue-url $(aws sqs get-queue-url --queue-name audit-jobs --query 'QueueUrl' --output text) \
  --message-body '{"PaymentId": "test-123", "OwnerId": "owner-456", "Amount": "50"}'
```

## Monitoring with Application Signals

After deployment, you can monitor the audit service using AWS Application Signals:

### Service Map
1. Navigate to **CloudWatch > Application Signals > Service map**
2. Look for the `audit-service` node
3. View dependencies to DynamoDB and SQS

### Metrics Dashboard
1. Go to **CloudWatch > Application Signals > Services**
2. Select `audit-service`
3. Monitor key metrics:
   - **Latency**: P99, P95, P50 response times
   - **Volume**: Request count and throughput
   - **Errors**: Error rate and fault percentage

### Distributed Tracing
1. Navigate to **X-Ray > Traces**
2. Filter by service name: `audit-service`
3. Analyze trace details including:
   - SQS message processing time
   - DynamoDB query performance
   - Custom attributes (`owner.id`, `order.id`)

### Setting Up SLOs
Create Service Level Objectives for the audit service:
```bash
# Example: 99% availability SLO
aws application-signals create-service-level-objective \
  --name "audit-service-availability" \
  --description "99% availability for audit service" \
  --sli-config '{
    "sliMetric": {
      "metricType": "AVAILABILITY"
    },
    "metricThreshold": 99.0,
    "comparisonOperator": "GreaterThanOrEqualTo"
  }'
```

## Clean Up

To remove all resources created by this stack:

```bash
# Navigate to the CDK directory
cd cdk

# Destroy the stack
./cdk.sh destroy
```

Additionally, if you created the `PetClinicPayment` DynamoDB table for testing and it's not being used by other services, you can remove it:

```bash
aws dynamodb delete-table --table-name PetClinicPayment
```

> **Note:** Be cautious when deleting this table if the Pet Clinic application is still running, as the Payment Service depends on this table.

## CDK Script Options

The `cdk.sh` script supports the following commands:

- `./cdk.sh synth` - Only synthesize the CloudFormation template
- `./cdk.sh deploy` - Deploy the stack
- `./cdk.sh destroy` - Remove all resources in the stack

## Lambda Function Code

The Lambda function code is located in the `sample-app/function` directory. It:

1. Processes SQS messages containing payment information
2. **Adds OpenTelemetry tracing attributes** for Application Signals
3. Queries a DynamoDB table named `PetClinicPayment` to verify payments
4. Implements retry logic when items are not immediately found
5. **Emits custom metrics and traces** for monitoring

## Payment Workflow and System Integration

The audit service is part of a larger payment processing workflow in the Pet Clinic application:

1. **User Flow**:
   - Users navigate to the pet clinic frontend and initiate a payment for pet services
   - The frontend makes a request to the API gateway (`spring-petclinic-api-gateway`)
   - The API gateway forwards the request to the Payment Service

2. **Payment Processing**:
   - The .NET Payment Service (`dotnet-petclinic-payment`) processes the payment request
   - It creates a new payment record with a unique ID
   - It stores the payment record in the `PetClinicPayment` DynamoDB table
   - It sends a message to the `audit-jobs` SQS queue with payment details
   - Reference: `/dotnet-petclinic-payment/PetClinic.PaymentService/Program.cs` (lines 110-187)

3. **Audit Process**:
   - The audit-service Lambda function is triggered by the SQS message
   - It extracts payment information from the message
   - It queries the DynamoDB table to verify the payment was properly recorded
   - If the payment record is not found immediately, it implements retry logic (up to 2 minutes)
   - It reports success or failure through logs and traces

4. **Observability with Application Signals**:
   - Both the Payment Service and Audit Service use OpenTelemetry for tracing
   - They add custom attributes like `owner.id`, `pet.id`, and `order.id` to traces
   - **AWS Application Signals provides end-to-end visibility** across the entire payment workflow
   - **Service dependencies are automatically mapped** showing the flow from API Gateway → Payment Service → SQS → Audit Service → DynamoDB

## Troubleshooting Application Signals

### Common Issues

1. **Service not appearing in Application Signals**:
   - Verify OpenTelemetry layer is attached
   - Check IAM permissions include `CloudWatchLambdaApplicationSignalsExecutionRolePolicy`
   - Ensure X-Ray tracing is enabled
   - Confirm environment variables are set correctly

2. **Missing traces or metrics**:
   - Check CloudWatch logs for OpenTelemetry initialization errors
   - Verify the function is being invoked (send test messages)
   - Ensure Application Signals is enabled in your AWS region

3. **Custom attributes not showing**:
   - Verify the Lambda function code is setting span attributes correctly
   - Check that the OpenTelemetry SDK is properly initialized

### Debug Commands

```bash
# Check Lambda function configuration
aws lambda get-function-configuration --function-name audit-service

# View recent CloudWatch logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/audit-service"

# Check X-Ray traces
aws xray get-trace-summaries --time-range-type TimeRangeByStartTime \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S)
```

## Notes

- **The Lambda function is fully integrated with AWS Application Signals** via the OpenTelemetry layer v5
- **Python 3.13 runtime** provides better performance and compatibility
- The SQS queue is required for the payment service to function correctly - if the queue doesn't exist, the payment service will return errors when attempting to process payments
- When deploying in a different region, the OpenTelemetry layer ARN will be selected based on the region
- **Application Signals data retention**: Metrics are retained for 15 months, traces for 30 days
- **Cost considerations**: Application Signals pricing is based on ingested metrics and traces