import os
import boto3
import json
import uuid
import uvicorn
from strands import Agent, tool
from strands.models import BedrockModel
from bedrock_agentcore.runtime import BedrockAgentCoreApp

BEDROCK_MODEL_ID = "us.anthropic.claude-3-5-haiku-20241022-v1:0"

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
    """Delegate nutrition questions to the specialized nutrition agent. Requires the nutrition agent ARN as a parameter.
    
    IMPORTANT: This function may return an error message starting with 'ERROR:' if nutrition information is unavailable.
    When this happens, you MUST inform the customer honestly that nutrition data is not available.
    NEVER generate or hallucinate nutrition recommendations when you receive an error response.
    """
    
    if not agent_arn:
        return "ERROR: Nutrition specialist configuration error. Please call (555) 123-PETS ext. 201."
    
    try:
        client = boto3.client('bedrock-agentcore')
        response = client.invoke_agent_runtime(
            agentRuntimeArn=agent_arn,
            runtimeSessionId=session_id,
            qualifier='DEFAULT',
            payload=json.dumps({'prompt': query})
        )
        # Read the streaming response
        if 'response' in response:
            body = response['response'].read().decode('utf-8')
            return body
        else:
            return "ERROR: Our nutrition specialist is experiencing high demand. Please try again in a few moments or call (555) 123-PETS ext. 201."
    except Exception as e:
        print(f"Error calling nutrition specialist: {e}")
        error_msg = str(e)
        
        # Handle specific error types
        if "404" in error_msg or "not found" in error_msg.lower():
            return "ERROR: Nutrition information is not available for this pet type at this time. Please contact our nutrition specialist directly at (555) 123-PETS ext. 201 for personalized recommendations."
        elif "ServiceUnavailableException" in error_msg or "unavailable" in error_msg.lower():
            return "ERROR: The nutrition service is temporarily unavailable. Please try again later or call (555) 123-PETS ext. 201."
        elif "TimeoutException" in error_msg or "timeout" in error_msg.lower():
            return "ERROR: The nutrition specialist request timed out. Please try again or call (555) 123-PETS ext. 201."
        else:
            return f"ERROR: Unable to reach our nutrition specialist. Please call (555) 123-PETS ext. 201 for assistance."

agent = None
agent_app = BedrockAgentCoreApp()
session_id = f"clinic-session-{str(uuid.uuid4())}"

system_prompt = (
    "You are a helpful pet clinic assistant. You can help with:\n"
    "- General clinic information (hours, contact info)\n"
    "- Emergency situations and contacts\n"
    "- Directing clients to appropriate specialists\n"
    "- Scheduling guidance\n"
    "- Basic medical guidance and when to seek veterinary care\n\n"
    "CRITICAL GUIDELINES FOR NUTRITION QUESTIONS:\n"
    "- ONLY use the consult_nutrition_specialist tool for EXPLICIT nutrition-related questions (diet, feeding, supplements, food recommendations, what to feed, can pets eat X, nutrition advice)\n"
    "- DO NOT use the nutrition agent for general clinic questions, appointments, hours, emergencies, or non-nutrition medical issues\n"
    "- WHEN the consult_nutrition_specialist tool returns a response starting with 'ERROR:', you MUST:\n"
    "  1. Acknowledge that nutrition information is currently unavailable for that pet type\n"
    "  2. Provide the contact information included in the error message\n"
    "  3. NEVER generate or make up nutrition recommendations\n"
    "  4. NEVER pretend you have access to nutrition data when you received an error\n"
    "- Example response when nutrition data is unavailable: 'I apologize, but we don't currently have nutrition information available for that type of pet in our database. For personalized nutrition recommendations, please contact our nutrition specialist directly at (555) 123-PETS ext. 201.'\n\n"
    "OTHER GUIDELINES:\n"
    "- NEVER expose or mention agent ARNs in your responses to users\n"
    "- For medical concerns, provide general guidance and recommend scheduling a veterinary appointment\n"
    "- For emergencies, immediately provide emergency contact information\n"
    "- Always recommend consulting with a veterinarian for proper diagnosis and treatment\n\n"
    f"Your session ID is: {session_id}. When calling consult_nutrition_specialist, use this session_id parameter."
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
    agent = create_clinic_agent()
    msg = payload.get('prompt', '')
    response_data = []
    
    async for event in agent.stream_async(msg):
        if 'data' in event:
            response_data.append(event['data'])
    
    return ''.join(response_data)

if __name__ == "__main__":    
    uvicorn.run(agent_app, host='0.0.0.0', port=8080)
