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

    // OpenTelemetry Layer ARNs by region (updated to version 5 for Application Signals)
    const layerArnsByRegion: { [key: string]: string } = {
      'af-south-1': 'arn:aws:lambda:af-south-1:904233096616:layer:AWSOpenTelemetryDistroPython:5',
      'ap-east-1': 'arn:aws:lambda:ap-east-1:888577020596:layer:AWSOpenTelemetryDistroPython:5',
      'ap-northeast-1': 'arn:aws:lambda:ap-northeast-1:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'ap-northeast-2': 'arn:aws:lambda:ap-northeast-2:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'ap-northeast-3': 'arn:aws:lambda:ap-northeast-3:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'ap-south-1': 'arn:aws:lambda:ap-south-1:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'ap-south-2': 'arn:aws:lambda:ap-south-2:796973505492:layer:AWSOpenTelemetryDistroPython:5',
      'ap-southeast-1': 'arn:aws:lambda:ap-southeast-1:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'ap-southeast-2': 'arn:aws:lambda:ap-southeast-2:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'ap-southeast-3': 'arn:aws:lambda:ap-southeast-3:039612877180:layer:AWSOpenTelemetryDistroPython:5',
      'ap-southeast-4': 'arn:aws:lambda:ap-southeast-4:713881805771:layer:AWSOpenTelemetryDistroPython:5',
      'ca-central-1': 'arn:aws:lambda:ca-central-1:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'eu-central-1': 'arn:aws:lambda:eu-central-1:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'eu-central-2': 'arn:aws:lambda:eu-central-2:156041407956:layer:AWSOpenTelemetryDistroPython:5',
      'eu-north-1': 'arn:aws:lambda:eu-north-1:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'eu-south-1': 'arn:aws:lambda:eu-south-1:257394471194:layer:AWSOpenTelemetryDistroPython:5',
      'eu-south-2': 'arn:aws:lambda:eu-south-2:490004653786:layer:AWSOpenTelemetryDistroPython:5',
      'eu-west-1': 'arn:aws:lambda:eu-west-1:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'eu-west-2': 'arn:aws:lambda:eu-west-2:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'eu-west-3': 'arn:aws:lambda:eu-west-3:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'il-central-1': 'arn:aws:lambda:il-central-1:746669239226:layer:AWSOpenTelemetryDistroPython:5',
      'me-central-1': 'arn:aws:lambda:me-central-1:739275441131:layer:AWSOpenTelemetryDistroPython:5',
      'me-south-1': 'arn:aws:lambda:me-south-1:980921751758:layer:AWSOpenTelemetryDistroPython:5',
      'sa-east-1': 'arn:aws:lambda:sa-east-1:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'us-east-1': 'arn:aws:lambda:us-east-1:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'us-east-2': 'arn:aws:lambda:us-east-2:615299751070:layer:AWSOpenTelemetryDistroPython:5',
      'us-west-1': 'arn:aws:lambda:us-west-1:615299751070:layer:AWSOpenTelemetryDistroPython:11',
      'us-west-2': 'arn:aws:lambda:us-west-2:615299751070:layer:AWSOpenTelemetryDistroPython:11',
    };

    // Get appropriate layer ARN for the current region
    const regionName = cdk.Stack.of(this).region;
    const otelLayerArn = layerArnsByRegion[regionName] || '';

    // Create Lambda function with Application Signals enabled
    const auditServiceLambda = new lambda.Function(this, 'AuditServiceLambda', {
      functionName: 'audit-service',
      runtime: lambda.Runtime.PYTHON_3_13, // Updated to Python 3.13 for better compatibility
      handler: 'lambda_function.lambda_handler',
      timeout: cdk.Duration.seconds(600),
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../sample-app/build/function.zip')),
      tracing: lambda.Tracing.ACTIVE, // Enable X-Ray tracing for Application Signals
      environment: {
        // Required for OpenTelemetry auto-instrumentation
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-instrument',
        // Application Signals specific environment variables
        OTEL_PROPAGATORS: 'tracecontext,baggage,xray',
        OTEL_PYTHON_DISABLED_INSTRUMENTATIONS: 'urllib3',
        // Service name for Application Signals
        OTEL_SERVICE_NAME: 'audit-service',
        OTEL_RESOURCE_ATTRIBUTES: 'service.name=audit-service,service.version=1.0.0',
      },
    });

    // Add OpenTelemetry layer if available for the region
    if (otelLayerArn) {
      auditServiceLambda.addLayers(
        lambda.LayerVersion.fromLayerVersionArn(this, 'OtelLayer', otelLayerArn)
      );
    }

    // Add SQS as event source for the Lambda function
    auditServiceLambda.addEventSource(new lambdaEventSources.SqsEventSource(auditJobsQueue, {
      batchSize: 1
    }));

    // Output important information
    new cdk.CfnOutput(this, 'AuditServiceFunctionName', {
      value: auditServiceLambda.functionName,
      description: 'Lambda function name for audit service',
    });

    new cdk.CfnOutput(this, 'AuditJobsQueueUrl', {
      value: auditJobsQueue.queueUrl,
      description: 'SQS queue URL for audit jobs',
    });

    new cdk.CfnOutput(this, 'ApplicationSignalsEnabled', {
      value: 'true',
      description: 'Application Signals is enabled for this Lambda function',
    });
  }
}