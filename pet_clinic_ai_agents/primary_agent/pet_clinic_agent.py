import os
import boto3
import json
import uuid
import uvicorn
import time
from strands import Agent, tool
from strands.models import BedrockModel
from bedrock_agentcore.runtime import BedrockAgentCoreApp

BEDROCK_MODEL_ID = "us.anthropic.claude-3-5-haiku-20241022-v1:0"

# Rate limiting and caching
last_request_time = 0
min_request_interval = 0.1  # 100ms between requests
response_cache = {}
cache_ttl = 300  # 5 minutes

@tool
def get_clinic_hours():
    """Get pet clinic operating hours"""
    return "Monday-Friday: 8AM-6PM, Saturday: 9AM-4PM, Sunday: Closed. Emergency services available 24/7."

@tool
def get_emergency_contact():
    """Get emergency contact information"""
    return "Emergency Line: (555) 123-PETS. For life-threatening emergencies, call immediately or visit our 24/7 emergency clinic."

@tool
def get_specialist_referral(specialty):
    """Get information about specialist referrals"""
    specialists = {
        "nutrition": "Dr. Smith - Pet Nutrition Specialist (ext. 201)",
        "surgery": "Dr. Johnson - Veterinary Surgeon (ext. 202)", 
        "dermatology": "Dr. Brown - Pet Dermatologist (ext. 203)",
        "cardiology": "Dr. Davis - Veterinary Cardiologist (ext. 204)"
    }
    return specialists.get(specialty.lower(), "Please call (555) 123-PETS for specialist referral information.")

@tool
def get_appointment_availability():
    """Check current appointment availability"""
    return "We have appointments available: Today 3:00 PM, Tomorrow 10:00 AM and 2:30 PM. Call (555) 123-PETS to schedule."

@tool
def consult_nutrition_specialist(query, agent_arn, session_id=None):
    """Delegate nutrition questions to the specialized nutrition agent. Requires the nutrition agent ARN as a parameter."""
    
    if not agent_arn:
        return "Nutrition specialist configuration error. Please call (555) 123-PETS ext. 201."
    
    # Check cache first
    cache_key = f"nutrition_{hash(query)}"
    current_time = time.time()
    if cache_key in response_cache:
        cached_response, timestamp = response_cache[cache_key]
        if current_time - timestamp < cache_ttl:
            return cached_response
    
    try:
        client = boto3.client('bedrock-agentcore')
        
        # Add retry logic with exponential backoff
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = client.invoke_agent_runtime(
                    agentRuntimeArn=agent_arn,
                    runtimeSessionId=session_id,
                    qualifier='DEFAULT',
                    payload=json.dumps({'prompt': query})
                )
                
                if 'response' in response:
                    body = response['response'].read().decode('utf-8')
                    # Cache successful response
                    response_cache[cache_key] = (body, current_time)
                    return body
                else:
                    return "Our nutrition specialist is experiencing high demand. Please try again in a few moments or call (555) 123-PETS ext. 201."
                    
            except client.exceptions.ThrottlingException:
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) + (0.1 * attempt)  # Exponential backoff
                    time.sleep(wait_time)
                    continue
                else:
                    return "Nutrition specialist is busy. Please try again later or call (555) 123-PETS ext. 201."
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(1)
                    continue
                else:
                    print(f"Error calling nutrition specialist: {e}")
                    return "Unable to reach our nutrition specialist. Please call (555) 123-PETS ext. 201."
                    
    except Exception as e:
        print(f"Error calling nutrition specialist: {e}")
        return "Unable to reach our nutrition specialist. Please call (555) 123-PETS ext. 201."

agent = None
agent_app = BedrockAgentCoreApp()
session_id = f"clinic-session-{str(uuid.uuid4())}"

# Optimized system prompt - reduced token usage
system_prompt = (
    "Pet clinic assistant helping with:\n"
    "- Clinic info (hours, contact)\n"
    "- Emergency contacts\n"
    "- Specialist referrals\n"
    "- Scheduling\n"
    "- Basic medical guidance\n\n"
    "RULES:\n"
    "- Use consult_nutrition_specialist ONLY for nutrition questions (diet, feeding, supplements, food)\n"
    "- Never mention agent ARNs to users\n"
    "- For medical concerns, recommend veterinary appointment\n"
    "- For emergencies, provide emergency contact immediately\n\n"
    f"Session ID: {session_id}"
)

def create_clinic_agent():
    model = BedrockModel(
        model_id=BEDROCK_MODEL_ID,
    )
    
    tools = [get_clinic_hours, get_emergency_contact, get_specialist_referral, consult_nutrition_specialist, get_appointment_availability]
    
    return Agent(model=model, tools=tools, system_prompt=system_prompt)

@agent_app.entrypoint
async def invoke(payload, context):
    """
    Invoke the clinic agent with a payload
    """ 
    global last_request_time
    
    # Rate limiting
    current_time = time.time()
    if current_time - last_request_time < min_request_interval:
        time.sleep(min_request_interval - (current_time - last_request_time))
    last_request_time = time.time()
    
    agent = create_clinic_agent()
    msg = payload.get('prompt', '')
    response_data = []
    
    async for event in agent.stream_async(msg):
        if 'data' in event:
            response_data.append(event['data'])
    
    return ''.join(response_data)

if __name__ == "__main__":    
    uvicorn.run(agent_app, host='0.0.0.0', port=8080)