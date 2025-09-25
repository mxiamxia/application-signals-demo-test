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
    });

    // Add SQS as event source for the Lambda function
    auditServiceLambda.addEventSource(new lambdaEventSources.SqsEventSource(auditJobsQueue, {
      batchSize: 1
    }));
  }
}