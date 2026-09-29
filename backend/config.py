import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    groq_api_key: str = "default"
    supabase_url: str = "default"
    supabase_service_role_key: str = "default"
    redis_url: str = "redis://localhost:6379/0"
    dristi_url: str = "http://localhost:8001"
    allowed_origins: str = "https://aria.swarajchattaraj.tech"
    environment: str = "development"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    def get_allowed_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

settings = Settings()
