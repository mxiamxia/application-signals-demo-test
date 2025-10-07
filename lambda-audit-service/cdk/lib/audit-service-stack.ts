import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as applicationsignals from 'aws-cdk-lib/aws-applicationsignals';
import { Construct } from 'constructs';
import * as path from 'path';

export class AuditServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Step 1: Enable Application Signals Discovery
    const cfnDiscovery = new applicationsignals.CfnDiscovery(this,
      'ApplicationSignalsDiscovery', { }
    );

    // Step 2: Get ADOT Lambda Layer ARN
    // ADOT Lambda Layer for Application Signals (Python 3.12)
    const adotLayerArn = (() => {
      const layerArns: { [key: string]: string } = {
        // Latest ARNs from AWS documentation for Python runtime
        'us-east-1': 'arn:aws:lambda:us-east-1:615299751070:layer:AWSOpenTelemetryDistroPython:16',
        'us-east-2': 'arn:aws:lambda:us-east-2:615299751070:layer:AWSOpenTelemetryDistroPython:13',
        'us-west-1': 'arn:aws:lambda:us-west-1:615299751070:layer:AWSOpenTelemetryDistroPython:20',
        'us-west-2': 'arn:aws:lambda:us-west-2:615299751070:layer:AWSOpenTelemetryDistroPython:20',
        'eu-west-1': 'arn:aws:lambda:eu-west-1:615299751070:layer:AWSOpenTelemetryDistroPython:13',
        'eu-central-1': 'arn:aws:lambda:eu-central-1:615299751070:layer:AWSOpenTelemetryDistroPython:13',
        'ap-southeast-1': 'arn:aws:lambda:ap-southeast-1:615299751070:layer:AWSOpenTelemetryDistroPython:13',
        'ap-southeast-2': 'arn:aws:lambda:ap-southeast-2:615299751070:layer:AWSOpenTelemetryDistroPython:13',
        'ap-northeast-1': 'arn:aws:lambda:ap-northeast-1:615299751070:layer:AWSOpenTelemetryDistroPython:13',
      };
      return layerArns[this.region] || layerArns['us-east-1']; // Fallback to us-east-1
    })();

    const adotLayer = lambda.LayerVersion.fromLayerVersionArn(
      this, 'AwsLambdaLayerForOtel',
      adotLayerArn
    );

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

    // Step 3: Add Application Signals execution permissions
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


    // Create Lambda function
    const auditServiceLambda = new lambda.Function(this, 'AuditServiceLambda', {
      functionName: 'audit-service',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.lambda_handler',
      timeout: cdk.Duration.seconds(600),
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../sample-app/build/function.zip')),
      // Step 4: Enable Active tracing
      tracing: lambda.Tracing.ACTIVE,
      // Step 5: Add ADOT Layer
      layers: [adotLayer],
      // Step 6: Configure Environment Variables
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-instrument', // Required for Application Signals
        // Enable Python logging auto-instrumentation for better observability
        OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED: 'true',
      },
    });

    // Add SQS as event source for the Lambda function
    auditServiceLambda.addEventSource(new lambdaEventSources.SqsEventSource(auditJobsQueue, {
      batchSize: 1
    }));
  }
}