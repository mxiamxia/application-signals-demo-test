import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import * as path from 'path';

export class AuditServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SQS Queue
    const auditJobsQueue = new sqs.Queue(this, 'AuditJobsQueue', {
      queueName: 'audit-jobs',
      visibilityTimeout: cdk.Duration.seconds(600),
      receiveMessageWaitTime: cdk.Duration.seconds(0),
      retentionPeriod: cdk.Duration.seconds(1000),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: new sqs.Queue(this, 'AuditJobsDLQ', {
          queueName: 'audit-jobs-dlq',
          retentionPeriod: cdk.Duration.days(14),
        }),
      },
    });

    // Grant permissions to the queue with a policy similar to the Terraform one
    const queuePolicy = new sqs.QueuePolicy(this, 'AuditQueuePolicy', {
      queues: [auditJobsQueue],
    });
    
    queuePolicy.document.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'sqs:ChangeMessageVisibility',
          'sqs:ChangeMessageVisibilityBatch',
          'sqs:GetQueueAttributes',
          'sqs:GetQueueUrl',
          'sqs:ListDeadLetterSourceQueues',
          'sqs:ListQueues',
          'sqs:ReceiveMessage',
          'sqs:SendMessage',
          'sqs:SendMessageBatch',
          'sqs:SetQueueAttributes',
        ],
        resources: ['arn:aws:sqs:*:*:*/SQSPolicy'],
      })
    );

    // IAM Role for Lambda
    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecRoleAuditService', {
      roleName: 'lambda_exec_role_audit_service',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Add Lambda logging permissions
    lambdaExecutionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // Add Application Signals policy for Lambda
    lambdaExecutionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLambdaApplicationSignalsExecutionRolePolicy')
    );

    // Add DynamoDB read permissions for PetClinicPayment table only
    const dynamoDbPolicy = new iam.Policy(this, 'DynamoDBReadPolicy', {
      policyName: 'lambda_dynamodb_read_policy',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:GetItem',
            'dynamodb:BatchGetItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:DescribeTable',
          ],
          resources: [
            `arn:aws:dynamodb:*:*:table/PetClinicPayment`,
            `arn:aws:dynamodb:*:*:table/PetClinicPayment/index/*`
          ],
        }),
      ],
    });
    dynamoDbPolicy.attachToRole(lambdaExecutionRole);

    // Application Signals Layer ARNs by region (updated to latest version)
    const appSignalsLayerArnsByRegion: { [key: string]: string } = {
      'af-south-1': 'arn:aws:lambda:af-south-1:097191281231:layer:ApplicationSignalsPython:15',
      'ap-east-1': 'arn:aws:lambda:ap-east-1:097191281231:layer:ApplicationSignalsPython:14',
      'ap-northeast-1': 'arn:aws:lambda:ap-northeast-1:097191281231:layer:ApplicationSignalsPython:15',
      'ap-northeast-2': 'arn:aws:lambda:ap-northeast-2:097191281231:layer:ApplicationSignalsPython:15',
      'ap-northeast-3': 'arn:aws:lambda:ap-northeast-3:097191281231:layer:ApplicationSignalsPython:15',
      'ap-south-1': 'arn:aws:lambda:ap-south-1:097191281231:layer:ApplicationSignalsPython:15',
      'ap-south-2': 'arn:aws:lambda:ap-south-2:097191281231:layer:ApplicationSignalsPython:14',
      'ap-southeast-1': 'arn:aws:lambda:ap-southeast-1:097191281231:layer:ApplicationSignalsPython:15',
      'ap-southeast-2': 'arn:aws:lambda:ap-southeast-2:097191281231:layer:ApplicationSignalsPython:15',
      'ap-southeast-3': 'arn:aws:lambda:ap-southeast-3:097191281231:layer:ApplicationSignalsPython:14',
      'ap-southeast-4': 'arn:aws:lambda:ap-southeast-4:097191281231:layer:ApplicationSignalsPython:14',
      'ca-central-1': 'arn:aws:lambda:ca-central-1:097191281231:layer:ApplicationSignalsPython:15',
      'ca-west-1': 'arn:aws:lambda:ca-west-1:097191281231:layer:ApplicationSignalsPython:14',
      'eu-central-1': 'arn:aws:lambda:eu-central-1:097191281231:layer:ApplicationSignalsPython:15',
      'eu-central-2': 'arn:aws:lambda:eu-central-2:097191281231:layer:ApplicationSignalsPython:14',
      'eu-north-1': 'arn:aws:lambda:eu-north-1:097191281231:layer:ApplicationSignalsPython:15',
      'eu-south-1': 'arn:aws:lambda:eu-south-1:097191281231:layer:ApplicationSignalsPython:14',
      'eu-south-2': 'arn:aws:lambda:eu-south-2:097191281231:layer:ApplicationSignalsPython:14',
      'eu-west-1': 'arn:aws:lambda:eu-west-1:097191281231:layer:ApplicationSignalsPython:15',
      'eu-west-2': 'arn:aws:lambda:eu-west-2:097191281231:layer:ApplicationSignalsPython:15',
      'eu-west-3': 'arn:aws:lambda:eu-west-3:097191281231:layer:ApplicationSignalsPython:15',
      'il-central-1': 'arn:aws:lambda:il-central-1:097191281231:layer:ApplicationSignalsPython:14',
      'me-central-1': 'arn:aws:lambda:me-central-1:097191281231:layer:ApplicationSignalsPython:14',
      'me-south-1': 'arn:aws:lambda:me-south-1:097191281231:layer:ApplicationSignalsPython:14',
      'mx-central-1': 'arn:aws:lambda:mx-central-1:097191281231:layer:ApplicationSignalsPython:6',
      'sa-east-1': 'arn:aws:lambda:sa-east-1:097191281231:layer:ApplicationSignalsPython:15',
      'us-east-1': 'arn:aws:lambda:us-east-1:097191281231:layer:ApplicationSignalsPython:15',
      'us-east-2': 'arn:aws:lambda:us-east-2:097191281231:layer:ApplicationSignalsPython:15',
      'us-west-1': 'arn:aws:lambda:us-west-1:097191281231:layer:ApplicationSignalsPython:15',
      'us-west-2': 'arn:aws:lambda:us-west-2:097191281231:layer:ApplicationSignalsPython:15',
    };

    // Get appropriate layer ARN for the current region
    const regionName = cdk.Stack.of(this).region;
    const appSignalsLayerArn = appSignalsLayerArnsByRegion[regionName] || '';

    // Create Lambda function with Application Signals configuration
    const auditServiceLambda = new lambda.Function(this, 'AuditServiceLambda', {
      functionName: 'audit-service',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.lambda_handler',
      timeout: cdk.Duration.seconds(600),
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../sample-app/build/function.zip')),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/python/aws/application_signals/distro/otel_wrapper',
        OTEL_SERVICE_NAME: 'audit-service',
        OTEL_METRICS_EXPORTER: 'none',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
        OTEL_AWS_APPLICATION_SIGNALS_ENABLED: 'true',
        OTEL_AWS_APPLICATION_SIGNALS_EXPORTER_ENDPOINT: 'http://localhost:2000/otlp',
        OTEL_TRACES_SAMPLER: 'xray',
        OTEL_TRACES_SAMPLER_ARG: 'endpoint=http://localhost:2000',
        OTEL_PROPAGATORS: 'xray,tracecontext,b3,b3multi',
        OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED: 'true',
        OTEL_PYTHON_LOG_CORRELATION: 'true'
      },
    });

    // Add Application Signals layer if available for the region
    if (appSignalsLayerArn) {
      auditServiceLambda.addLayers(
        lambda.LayerVersion.fromLayerVersionArn(this, 'AppSignalsLayer', appSignalsLayerArn)
      );
    }

    // Add SQS as event source for the Lambda function
    auditServiceLambda.addEventSource(new lambdaEventSources.SqsEventSource(auditJobsQueue, {
      batchSize: 1
    }));

    // Output the Lambda function ARN and other useful information
    new cdk.CfnOutput(this, 'AuditServiceFunctionArn', {
      value: auditServiceLambda.functionArn,
      description: 'The ARN of the audit-service Lambda function',
    });

    new cdk.CfnOutput(this, 'AuditServiceFunctionName', {
      value: auditServiceLambda.functionName,
      description: 'The name of the audit-service Lambda function',
    });

    new cdk.CfnOutput(this, 'ApplicationSignalsEnabled', {
      value: 'true',
      description: 'Application Signals is enabled for this Lambda function',
    });
  }
}