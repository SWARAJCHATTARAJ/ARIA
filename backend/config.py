import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Any

class Settings(BaseSettings):
    groq_api_key: str = "default"
    groq_model: str = "openai/gpt-oss-120b"
    groq_writer_model: str = "openai/gpt-oss-120b"
    groq_judge_model: str = "openai/gpt-oss-120b"
    groq_writer_tpm: int = 7500
    groq_writer_tpd: int = 160000
    groq_judge_tpm: int = 7500
    groq_judge_tpd: int = 160000
    daily_token_cap: int = 160000
    jwt_auth_enabled: bool = False
    supabase_url: str = "default"
    supabase_service_role_key: str = "default"
    redis_url: str = "redis://localhost:6379/0"
    aria_port: int = 8000
    dristi_url: str = "http://localhost:8001"
    allowed_origins: str = "https://aria.swarajchattaraj.tech"
    environment: str = "development"
    fetch_top_n: int = 2
    supabase_jwt_secret: str = ""
    fastembed_cache_path: str = os.path.expanduser("~/.cache/fastembed")

    _backend_env = os.path.join(os.path.dirname(__file__), ".env")
    model_config = SettingsConfigDict(
        env_file=_backend_env if os.path.exists(_backend_env) else ".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def model_post_init(self, __context: Any) -> None:
        if "FETCH_TOP_N" not in os.environ:
            self.fetch_top_n = 2
        # Keep groq_model synchronized with writer model if not explicitly set
        if "GROQ_MODEL" not in os.environ and self.groq_writer_model:
            self.groq_model = self.groq_writer_model

    def get_allowed_origins_list(self) -> List[str]:
        raw_origins = [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]
        if self.environment.lower() in ("development", "dev", "local"):
            dev_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
            for d in dev_origins:
                if d not in raw_origins:
                    raw_origins.append(d)
        return raw_origins

settings = Settings()
