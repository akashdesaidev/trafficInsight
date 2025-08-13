"""
Celery worker configuration for handling background export tasks.
"""

import sys
import os
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.services.export_service import celery_app

if __name__ == "__main__":
    celery_app.start()