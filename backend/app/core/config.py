from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    api_v1_prefix: str = "/api"
    environment: str = "development"

    database_url: str = (
        "postgresql+psycopg2://traffic:traffic@localhost:5432/traffic_insight"
    )
    redis_url: str = "redis://localhost:6379/0"

    tomtom_maps_api_key: str = ""
    tomtom_traffic_api_key: str = ""
    tomtom_search_api_key: str = ""
    tomtom_stats_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # Ignore unknown env vars like google_maps_api_key
    )
    
    @property
    def clean_tomtom_maps_api_key(self) -> str:
        """Clean API key by removing extra quotes and whitespace"""
        return self.tomtom_maps_api_key.strip().strip('"').strip("'")
    
    @property 
    def clean_tomtom_traffic_api_key(self) -> str:
        """Clean API key by removing extra quotes and whitespace"""
        return self.tomtom_traffic_api_key.strip().strip('"').strip("'")
    
    @property
    def clean_tomtom_search_api_key(self) -> str:
        """Clean API key by removing extra quotes and whitespace"""  
        return self.tomtom_search_api_key.strip().strip('"').strip("'")
    
    @property
    def clean_tomtom_stats_api_key(self) -> str:
        """Clean API key by removing extra quotes and whitespace"""
        return self.tomtom_stats_api_key.strip().strip('"').strip("'")


@lru_cache
def get_settings() -> Settings:
    return Settings()
