from strands import Agent, tool
import uvicorn
import yaml
import random
import requests
import os
from strands.models import BedrockModel
from bedrock_agentcore.runtime import BedrockAgentCoreApp

BEDROCK_MODEL_ID = "us.anthropic.claude-3-5-haiku-20241022-v1:0"

# Exceptions
class TimeoutException(Exception):
    def __init__(self, message, **kwargs):
        super().__init__(message)
        self.details = kwargs

class ValidationException(Exception):
    def __init__(self, message, **kwargs):
        super().__init__(message)
        self.details = kwargs

class ServiceException(Exception):
    def __init__(self, message, **kwargs):
        super().__init__(message)
        self.details = kwargs

class RateLimitException(Exception):
    def __init__(self, message, **kwargs):
        super().__init__(message)
        self.details = kwargs

class NetworkException(Exception):
    def __init__(self, message, **kwargs):
        super().__init__(message)
        self.details = kwargs

try:
    with open('pet_database.yaml', 'r') as f:
        ANIMAL_DATA = yaml.safe_load(f)
except Exception:
    ANIMAL_DATA = None

agent = None
agent_app = BedrockAgentCoreApp()

@tool
def get_nutrition_facts(pet_type):
    """Get nutrition facts from the nutrition service for a specific pet type"""
    try:
        # Try to get nutrition facts from the nutrition service
        nutrition_service_url = os.getenv('NUTRITION_SERVICE_URL', 'http://nutrition-service-nodejs:3000')
        response = requests.get(f"{nutrition_service_url}/nutrition/{pet_type.lower()}", timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            return data.get('facts', f"Nutrition information available for {pet_type}")
        elif response.status_code == 404:
            return f"I don't have specific nutrition information for {pet_type} in our database. Please consult with a veterinarian for proper dietary guidance."
        else:
            return f"Unable to retrieve nutrition information at this time. Please consult with a veterinarian for {pet_type} dietary guidance."
    except Exception as e:
        return f"I'm unable to access nutrition information right now. Please consult with a veterinarian for proper {pet_type} dietary guidance."

@tool
def get_feeding_guidelines(pet_type, age, weight):
    """Get feeding guidelines based on pet type, age, and weight"""    
    if ANIMAL_DATA is None:
        return "I don't have access to feeding guidelines right now. Please consult your veterinarian for specific feeding recommendations."
    
    animal = ANIMAL_DATA.get(pet_type.lower() + 's')
    if not animal:
        return f"I don't have specific feeding guidelines for {pet_type} in my database. Please consult your veterinarian for proper feeding recommendations."
    
    calories_per_lb = animal.get('calories_per_pound', '15-20')
    schedule = animal.get('feeding_schedule', {}).get(age.lower(), '2 times daily')
    
    try:
        weight = float(weight)
        if isinstance(calories_per_lb, str) and '-' in calories_per_lb:
            calories = weight * float(calories_per_lb.split('-')[0])
        else:
            calories = weight * float(calories_per_lb)
    except (ValueError, TypeError):
        return f"Feed based on veterinary recommendations for {pet_type}, {schedule}"
    
    return f"Feed approximately {calories:.0f} calories daily, {schedule}"

@tool
def get_dietary_restrictions(pet_type, condition):
    """Get dietary recommendations for specific health conditions by animal type"""    
    if ANIMAL_DATA is None:
        return "I don't have access to dietary restriction information right now. Please consult your veterinarian for condition-specific dietary advice."
    
    animal = ANIMAL_DATA.get(pet_type.lower() + 's')
    if not animal:
        return f"I don't have specific dietary restriction information for {pet_type} in my database. Please consult your veterinarian for condition-specific dietary advice."
    
    restrictions = animal.get('dietary_restrictions', {})
    return restrictions.get(condition.lower(), f"I don't have specific dietary restrictions for {condition} in {pet_type}. Please consult your veterinarian for condition-specific dietary advice.")

@tool
def get_nutritional_supplements(pet_type, supplement):
    """Get supplement recommendations by animal type"""    
    if ANIMAL_DATA is None:
        return "I don't have access to supplement information right now. Please consult your veterinarian before adding any supplements."
    
    animal = ANIMAL_DATA.get(pet_type.lower() + 's')
    if not animal:
        return f"I don't have specific supplement information for {pet_type} in my database. Please consult your veterinarian before adding any supplements."
    
    supplements = animal.get('supplements', {})
    return supplements.get(supplement.lower(), f"I don't have information about {supplement} supplements for {pet_type}. Please consult your veterinarian before adding any supplements.")

def create_nutrition_agent():
    model = BedrockModel(
        model_id=BEDROCK_MODEL_ID,
    )

    tools = [get_nutrition_facts, get_feeding_guidelines, get_dietary_restrictions, get_nutritional_supplements]

    system_prompt = (
        "You are a specialized pet nutrition expert providing evidence-based dietary guidance.\n\n"
        "Your expertise covers:\n"
        "- Feeding guidelines for dogs, cats, fish, horses, birds, rabbits, ferrets, hamsters, guinea pigs, reptiles, and amphibians\n"
        "- Therapeutic diets for health conditions (diabetes, kidney disease, allergies, obesity, arthritis)\n"
        "- Food safety and toxic substances to avoid\n"
        "- Nutritional supplements and their proper use\n"
        "- Food label interpretation and AAFCO standards\n\n"
        "CRITICAL GUIDELINES:\n"
        "- NEVER recommend specific product names or brands unless you have verified they exist\n"
        "- When you don't have information, always say 'I don't have that information' and recommend consulting a veterinarian\n"
        "- Do NOT fabricate or invent product names, supplements, or specific recommendations\n"
        "- Always be conservative and direct customers to veterinary professionals when uncertain\n"
        "- Provide general dietary principles rather than specific products when data is unavailable\n\n"
        "Key principles:\n"
        "- Cats are obligate carnivores requiring animal-based nutrients\n"
        "- Dogs are omnivores needing balanced animal and plant sources\n"
        "- Always recommend veterinary consultation for significant dietary changes\n"
        "- Provide specific, actionable advice only when you have verified information\n\n"
        "Toxic foods to avoid: garlic, onions, chocolate, grapes, xylitol, alcohol, macadamia nuts"
    )

    return Agent(model=model, tools=tools, system_prompt=system_prompt)

@agent_app.entrypoint
async def invoke(payload, context):
    """
    Invoke the nutrition agent with a payload
    """
    # Removed artificial error injection - was causing 35% failure rate
    # Production agents should not have artificial error injection
    
    try:
        agent = create_nutrition_agent()
        msg = payload.get('prompt', '')

        response_data = []
        async for event in agent.stream_async(msg):
            if 'data' in event:
                response_data.append(event['data'])
        
        return ''.join(response_data)
    except Exception as e:
        # Proper error handling without fabricating information
        return "I'm experiencing technical difficulties right now. Please consult with a veterinarian for proper pet nutrition guidance."

if __name__ == "__main__":    
    uvicorn.run(agent_app, host='0.0.0.0', port=8080)