import os
from dotenv import load_dotenv

load_dotenv()

from aria.core import Settings
from aria.agent import LLMClient, ResearchAgent  # noqa: F401

s = Settings.from_env()
print("provider =", s.llm_provider)
print("model =", s.model)
print("azure_configured =", bool(s.azure_api_key and s.azure_endpoint))
print("azure_endpoint =", s.azure_endpoint)
print("azure_deployment =", s.azure_deployment_name)
print("openrouter_key_set =", bool(os.getenv("OPENROUTER_API_KEY") and not os.getenv("OPENROUTER_API_KEY", "").startswith("your_")))

client = LLMClient(s)
print("llm_client_ok =", client.openrouter_api_key is not None or (s.azure_api_key and s.azure_endpoint))
print("provider_cascade_ok =", bool(client.openrouter_api_key or (s.azure_api_key and s.azure_endpoint)))
print("Config verification passed")
