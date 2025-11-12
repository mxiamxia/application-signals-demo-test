import json
import os
import random
import urllib.parse as urlparse
from urllib.request import Request, urlopen
import boto3
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

def load_prompts():
    with open('prompts.json', 'r') as f:
        return json.load(f)

def lambda_handler(event, context):
    primary_agent_arn = os.environ.get('PRIMARY_AGENT_ARN')
    nutrition_agent_arn = os.environ.get('NUTRITION_AGENT_ARN')
    num_requests = int(os.environ.get('REQUESTS_PER_INVOKE', '20'))

    if not primary_agent_arn:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'PRIMARY_AGENT_ARN environment variable not set'})
        }
    
    prompts = load_prompts()
    results = []
    
    for _ in range(num_requests):
        is_nutrition_query = random.random() <= 0.75
        
        if is_nutrition_query:
            query = random.choice(prompts['nutrition-queries'])
            enhanced_query = f"{query}\n\nNote: Our nutrition specialist agent ARN is {nutrition_agent_arn}" if nutrition_agent_arn else query
        else:
            query = random.choice(prompts['non-nutrition-queries'])
            enhanced_query = query

        try:
            encoded_arn = urlparse.quote(primary_agent_arn, safe='')
            region = os.environ.get('AWS_REGION', 'us-east-1')
            url = f'https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{encoded_arn}/invocations?qualifier=DEFAULT'
            
            payload = json.dumps({'prompt': enhanced_query})
            request = AWSRequest(method='POST', url=url, data=payload, headers={'Content-Type': 'application/json'})
            session = boto3.Session()
            credentials = session.get_credentials()
            
            SigV4Auth(credentials, 'bedrock-agentcore', region).add_auth(request)
            
            req = Request(url, data=payload.encode('utf-8'), headers=dict(request.headers))
            with urlopen(req) as response:
                body = response.read().decode('utf-8')
                
                # Validate response body before processing
                try:
                    response_data = json.loads(body) if body else {}
                    # Handle potential missing 'output' field that causes KeyError
                    if isinstance(response_data, dict) and 'output' not in response_data:
                        response_data['output'] = "I don't have that information available right now."
                    processed_body = json.dumps(response_data) if response_data else body
                except (json.JSONDecodeError, KeyError) as parse_error:
                    # Fallback for malformed responses
                    processed_body = json.dumps({
                        'output': "I don't have that information available right now.",
                        'error': f'Response processing error: {str(parse_error)}'
                    })
            
            results.append({
                'query': query,
                'response': processed_body,
                'agent_used': 'primary'
            })
            
        except Exception as error:
            # Enhanced error handling with graceful fallback
            error_message = str(error)
            if 'KeyError' in error_message and 'output' in error_message:
                # Specific handling for the KeyError: 'output' issue
                fallback_response = json.dumps({
                    'output': "I don't have that information available right now.",
                    'error': 'Agent response processing error - missing output field'
                })
                results.append({
                    'query': query,
                    'response': fallback_response,
                    'agent_used': 'primary',
                    'error_handled': True
                })
            else:
                results.append({
                    'query': query,
                    'error': error_message,
                    'agent_used': 'primary'
                })
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'total_requests': len(results),
            'results': results
        })
    }