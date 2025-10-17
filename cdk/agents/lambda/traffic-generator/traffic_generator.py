import json
import os
import random
import time
import hashlib
import urllib.parse as urlparse
from urllib.request import Request, urlopen
import boto3
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

# Simple in-memory cache for request deduplication
request_cache = {}
cache_ttl = 300  # 5 minutes

def load_prompts():
    with open('prompts.json', 'r') as f:
        return json.load(f)

def get_cache_key(query):
    """Generate cache key for request deduplication"""
    return hashlib.md5(query.encode()).hexdigest()

def lambda_handler(event, context):
    primary_agent_arn = os.environ.get('PRIMARY_AGENT_ARN')
    nutrition_agent_arn = os.environ.get('NUTRITION_AGENT_ARN')
    num_requests = int(os.environ.get('REQUESTS_PER_INVOKE', '10'))  # Reduced from 20 to 10

    if not primary_agent_arn:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'PRIMARY_AGENT_ARN environment variable not set'})
        }
    
    prompts = load_prompts()
    results = []
    current_time = time.time()
    
    # Clean expired cache entries
    expired_keys = [k for k, (_, timestamp) in request_cache.items() if current_time - timestamp > cache_ttl]
    for key in expired_keys:
        del request_cache[key]
    
    for i in range(num_requests):
        # Rate limiting - 100ms between requests
        if i > 0:
            time.sleep(0.1)
            
        is_nutrition_query = random.random() <= 0.6  # Reduced from 75% to 60%
        
        if is_nutrition_query:
            query = random.choice(prompts['nutrition-queries'])
            enhanced_query = f"{query}\n\nNote: Our nutrition specialist agent ARN is {nutrition_agent_arn}" if nutrition_agent_arn else query
        else:
            query = random.choice(prompts['non-nutrition-queries'])
            enhanced_query = query

        # Check cache for duplicate requests
        cache_key = get_cache_key(enhanced_query)
        if cache_key in request_cache:
            cached_response, timestamp = request_cache[cache_key]
            if current_time - timestamp < cache_ttl:
                results.append({
                    'query': query,
                    'response': cached_response,
                    'agent_used': 'primary',
                    'cached': True
                })
                continue

        try:
            encoded_arn = urlparse.quote(primary_agent_arn, safe='')
            region = os.environ.get('AWS_REGION', 'us-east-1')
            url = f'https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{encoded_arn}/invocations?qualifier=DEFAULT'
            
            payload = json.dumps({'prompt': enhanced_query})
            request = AWSRequest(method='POST', url=url, data=payload, headers={'Content-Type': 'application/json'})
            session = boto3.Session()
            credentials = session.get_credentials()
            
            SigV4Auth(credentials, 'bedrock-agentcore', region).add_auth(request)
            
            # Add retry logic with exponential backoff
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    req = Request(url, data=payload.encode('utf-8'), headers=dict(request.headers))
                    with urlopen(req) as response:
                        body = response.read().decode('utf-8')
                    
                    # Cache successful response
                    request_cache[cache_key] = (body, current_time)
                    
                    results.append({
                        'query': query,
                        'response': body,
                        'agent_used': 'primary',
                        'cached': False
                    })
                    break
                    
                except Exception as retry_error:
                    if attempt < max_retries - 1:
                        wait_time = (2 ** attempt) + (0.1 * attempt)  # Exponential backoff
                        time.sleep(wait_time)
                        continue
                    else:
                        raise retry_error
            
        except Exception as error:
            results.append({
                'query': query,
                'error': str(error),
                'cached': False
            })
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'total_requests': len(results),
            'cached_responses': len([r for r in results if r.get('cached', False)]),
            'results': results
        })
    }