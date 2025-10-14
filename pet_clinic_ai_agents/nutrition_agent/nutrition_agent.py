from strands import Agent, tool
import uvicorn
import yaml
import random
import time
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

# Rate limiting
last_request_time = 0
min_request_interval = 0.1  # 100ms between requests

@tool
def get_feeding_guidelines(pet_type, age, weight):
    """Get feeding guidelines based on pet type, age, and weight"""    
    if ANIMAL_DATA is None:
        return "Animal database is down, please consult your veterinarian for feeding guidelines."
    
    animal = ANIMAL_DATA.get(pet_type.lower() + 's')
    if not animal:
        return f"{pet_type.title()} not found in animal database. Consult veterinarian for specific feeding guidelines"
    
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
        return "Animal database is down, please consult your veterinarian for dietary advice."
    
    animal = ANIMAL_DATA.get(pet_type.lower() + 's')
    if not animal:
        return f"{pet_type.title()} not found in animal database. Consult veterinarian for condition-specific dietary advice"
    
    restrictions = animal.get('dietary_restrictions', {})
    return restrictions.get(condition.lower(), f"No dietary restrictions for {condition} found in animal database. Consult veterinarian for condition-specific dietary advice")

@tool
def get_nutritional_supplements(pet_type, supplement):
    """Get supplement recommendations by animal type"""    
    if ANIMAL_DATA is None:
        return "Animal database is down, please consult your veterinarian before adding supplements."
    
    animal = ANIMAL_DATA.get(pet_type.lower() + 's')
    if not animal:
        return f"{pet_type.title()} not found in animal database. Consult veterinarian before adding supplements"
    
    supplements = animal.get('supplements', {})
    return supplements.get(supplement.lower(), f"No information for {supplement} supplement found in animal database. Consult veterinarian before adding supplements")

def create_nutrition_agent():
    model = BedrockModel(
        model_id=BEDROCK_MODEL_ID,
    )

    tools = [get_feeding_guidelines, get_dietary_restrictions, get_nutritional_supplements]

    # Optimized system prompt - reduced token usage
    system_prompt = (
        "Pet nutrition expert providing evidence-based dietary guidance.\n\n"
        "Expertise: feeding guidelines, therapeutic diets, food safety, supplements.\n"
        "Animals: dogs, cats, fish, horses, birds, rabbits, ferrets, hamsters, guinea pigs, reptiles, amphibians.\n"
        "Conditions: diabetes, kidney disease, allergies, obesity, arthritis.\n\n"
        "Key principles:\n"
        "- Cats: obligate carnivores\n"
        "- Dogs: omnivores\n"
        "- Recommend veterinary consultation for dietary changes\n\n"
        "Toxic foods: garlic, onions, chocolate, grapes, xylitol, alcohol, macadamia nuts"
    )

    return Agent(model=model, tools=tools, system_prompt=system_prompt)
    
def maybe_throw_error(threshold: float=0.05):  # Reduced from 35% to 5% error rate
    """Randomly throw an error based on threshold probability"""
    if random.random() <= threshold:
        error_types = [
            (ValidationException, "Invalid nutrition query format", {"field": "nutrition_query", "value": "simulated_invalid_input"}),
            (RateLimitException, "Too many nutrition requests", {"retry_after_seconds": random.randint(5, 15), "limit_type": "requests_per_minute"}),
        ]
        
        exception_class, message, kwargs = random.choice(error_types)
        raise exception_class(message, **kwargs)

@agent_app.entrypoint
async def invoke(payload, context):
    """
    Invoke the nutrition agent with a payload
    """
    global last_request_time
    
    # Rate limiting
    current_time = time.time()
    if current_time - last_request_time < min_request_interval:
        time.sleep(min_request_interval - (current_time - last_request_time))
    last_request_time = time.time()
    
    # Reduced error rate from 35% to 5%
    maybe_throw_error(threshold=0.05)
    
    agent = create_nutrition_agent()
    msg = payload.get('prompt', '')

    response_data = []
    async for event in agent.stream_async(msg):
        if 'data' in event:
            response_data.append(event['data'])
    
    return ''.join(response_data)

if __name__ == "__main__":    
    uvicorn.run(agent_app, host='0.0.0.0', port=8080)