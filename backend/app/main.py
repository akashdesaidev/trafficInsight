import sys
import os
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.traffic import router as traffic_router
from app.api.search import router as search_router
from app.api.historical import router as historical_router
from app.api.chokepoints import router as chokepoints_router
from app.api.debug import router as debug_router
from app.api.directions import router as directions_router
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
app.include_router(search_router, prefix=settings.api_v1_prefix)
app.include_router(historical_router, prefix=settings.api_v1_prefix)
app.include_router(chokepoints_router, prefix=settings.api_v1_prefix)
app.include_router(debug_router, prefix=settings.api_v1_prefix)
app.include_router(directions_router, prefix=settings.api_v1_prefix)
# Default configuration for uvicorn (for reference/documentation)
# To run: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

def get_uvicorn_config():
    return {
        "host": "0.0.0.0",
        "port": 8000,
        "reload": True,
        "log_level": "info",
        "factory": False,
        "app": "app.main:app",
    }

if __name__ == "__main__":
    import uvicorn
    config = get_uvicorn_config()
    uvicorn.run(
        config["app"],
        host=config["host"],
        port=config["port"],
        reload=config["reload"],
        log_level=config["log_level"],
        factory=config["factory"],
    )