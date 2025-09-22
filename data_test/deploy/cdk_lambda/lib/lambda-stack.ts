import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export interface LambdaStackProps extends StackProps {
  functionName: string;
  lambdaCodePath: string;
  testCasesPath: string;
}

export class LambdaStack extends Stack {
  public readonly lambdaFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // Create Lambda execution role
    const role = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
    });

    // Add permissions for CloudWatch Logs, Metrics, X-Ray, and Application Signals
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchFullAccess'));
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXrayFullAccess'));
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLambdaApplicationSignalsExecutionRolePolicy'));

    // OpenTelemetry Layer ARNs by region for Python 3.9
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
      'us-west-1': 'arn:aws:lambda:us-west-1:615299751070:layer:AWSOpenTelemetryDistroPython:12',
      'us-west-2': 'arn:aws:lambda:us-west-2:615299751070:layer:AWSOpenTelemetryDistroPython:12',
    };

    // Get appropriate layer ARN for the current region
    const regionName = Stack.of(this).region;
    const otelLayerArn = layerArnsByRegion[regionName] || layerArnsByRegion['us-east-1'];
    
    // Create Lambda function from a directory
    this.lambdaFunction = new lambda.Function(this, 'APMDemoTestLambda', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset(path.resolve(__dirname, '../../lambda_deployment')), // Will be created by deployment script
      role: role,
      functionName: props.functionName,
      timeout: Duration.seconds(300),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(this, 'OtelLayer', otelLayerArn)
      ],
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-instrument',
        OTEL_METRICS_EXPORTER: 'otlp',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
        OTEL_SERVICE_NAME: props.functionName,
        OTEL_AWS_APPLICATION_SIGNALS_ENABLED: 'true',
      },
    });

    // Create an EventBridge rule to trigger the Lambda function every 30 minutes
    const rule = new events.Rule(this, 'ScheduleRule', {
      schedule: events.Schedule.rate(Duration.minutes(30)),
      description: 'Triggers the APM Demo Test Runner Lambda function every 30 minutes',
    });

    // Add the Lambda function as a target for the EventBridge rule
    rule.addTarget(new targets.LambdaFunction(this.lambdaFunction, {
      retryAttempts: 3, // Retry up to 3 times if the function fails
    }));
  }
}