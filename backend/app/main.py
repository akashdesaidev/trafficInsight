from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.traffic import router as traffic_router
from app.core.config import get_settings


settings = get_settings()
app = FastAPI(title="Traffic Insight API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health_router, prefix=settings.api_v1_prefix)
app.include_router(traffic_router, prefix=settings.api_v1_prefix)
