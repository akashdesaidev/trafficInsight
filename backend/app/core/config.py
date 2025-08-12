from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    api_v1_prefix: str = "/api"
    environment: str = "development"

    database_url: str = (
        "postgresql+psycopg2://traffic:traffic@localhost:5432/traffic_insight"
    )
    redis_url: str = "redis://localhost:6379/0"

    tomtom_maps_api_key: str = "EvQfbleOxpuHzwwvBjclEH8SxX4NJfQm"
    tomtom_traffic_api_key: str = "EvQfbleOxpuHzwwvBjclEH8SxX4NJfQm"
    tomtom_search_api_key: str = "EvQfbleOxpuHzwwvBjclEH8SxX4NJfQm"
    tomtom_stats_api_key: str = "UioZXOMob9uDIYtE2ZwLBTBOjtyPJBKc"

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


