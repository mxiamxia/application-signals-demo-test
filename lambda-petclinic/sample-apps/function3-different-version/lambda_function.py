import json
import boto3
import os
import random
from opentelemetry import trace


dynamodb = boto3.resource('dynamodb')
table_name = 'HistoricalRecordDynamoDBTable'
table = dynamodb.Table(table_name)

def lambda_handler(event, context):

    current_span = trace.get_current_span()
    # Add an attribute to the current span
    owner_id = random.randint(1, 9)  # Generate a random value between 1 and 9
    current_span.set_attribute("owner.id", owner_id)

    # Validate event structure and query parameters exist
    if event is None:
        return {
            'statusCode': 400,
            'body': json.dumps({'message': 'Invalid request: event is null'}),
            'headers': {
                'Content-Type': 'application/json'
            }
        }

    query_params = event.get('queryStringParameters')
    
    # Handle null queryStringParameters gracefully
    if query_params is None:
        query_params = {}

    record_id = query_params.get('recordId') if query_params else None
    owners = query_params.get('owners') if query_params else None
    pet_id = query_params.get('petid') if query_params else None

    # Validate pet_id before comparison
    if pet_id and pet_id == "111111111111":
        return {
            'statusCode': 400,
            'body': json.dumps({'message': 'Invalid pet ID provided'}),
            'headers': {
                'Content-Type': 'application/json'
            }
        }

    if owners is None or pet_id is None:
        return {
            'statusCode': 400,
            'body': json.dumps({'message': 'Missing required parameters: owners and petid'}),
            'headers': {
                'Content-Type': 'application/json'
            }
        }

    if record_id is None:
        return {
            'statusCode': 400,
            'body': json.dumps({'message': 'recordId is required'}),
            'headers': {
                'Content-Type': 'application/json'
            }
        }

    try:
        # Retrieve the item with the specified recordId
        response = table.get_item(Key={'recordId': record_id})  # Assuming recordId is the primary key

        # Check if the item exists
        if 'Item' in response:
            return {
                'statusCode': 200,
                'body': json.dumps(response['Item']),
                'headers': {
                    'Content-Type': 'application/json'
                }
            }
        else:
            return {
                'statusCode': 404,
                'body': json.dumps({'message': 'Record not found'}),
                'headers': {
                    'Content-Type': 'application/json'
                }
            }

    except Exception as e:
        print("Error retrieving record:", str(e))
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'Internal server error'}),
            'headers': {
                'Content-Type': 'application/json'
            }
        }