"""
Export service for generating JSON exports of traffic data.
Handles async job processing with Celery for large data exports.
"""

import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from pathlib import Path
import asyncio

try:
    from celery import Celery
    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False
    Celery = None

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models.database import TrafficMetric, ChokePoint


# Get settings instance
settings = get_settings()

# Initialize Celery if available
if CELERY_AVAILABLE and Celery:
    celery_app = Celery(
        "export_service",
        broker=settings.redis_url,
        backend=settings.redis_url,
    )
else:
    celery_app = None

# Export job states
class ExportStatus:
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class ExportService:
    """Service for handling data exports."""
    
    def __init__(self):
        self.export_dir = Path("exports")
        self.export_dir.mkdir(exist_ok=True)
    
    def create_export_job(
        self,
        start_date: datetime,
        end_date: datetime,
        bbox: Optional[Dict[str, float]] = None,
        export_type: str = "traffic_data",
        granularity: str = "hourly"
    ) -> str:
        """Create a new export job and return job ID."""
        job_id = str(uuid.uuid4())
        
        # Start async export task
        export_traffic_data.delay(
            job_id=job_id,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            bbox=bbox,
            export_type=export_type,
            granularity=granularity
        )
        
        return job_id
    
    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get the status of an export job."""
        result = celery_app.AsyncResult(job_id)
        
        if result.state == "PENDING":
            return {
                "job_id": job_id,
                "status": ExportStatus.PENDING,
                "progress": 0,
                "message": "Export job is queued"
            }
        elif result.state == "PROGRESS":
            return {
                "job_id": job_id,
                "status": ExportStatus.IN_PROGRESS,
                "progress": result.info.get("progress", 0),
                "message": result.info.get("message", "Processing...")
            }
        elif result.state == "SUCCESS":
            return {
                "job_id": job_id,
                "status": ExportStatus.COMPLETED,
                "progress": 100,
                "message": "Export completed successfully",
                "download_url": f"/api/export/download/{job_id}",
                "file_size": result.info.get("file_size", 0)
            }
        else:  # FAILURE
            return {
                "job_id": job_id,
                "status": ExportStatus.FAILED,
                "progress": 0,
                "message": str(result.info)
            }
    
    def get_export_file_path(self, job_id: str) -> Optional[Path]:
        """Get the file path for a completed export."""
        file_path = self.export_dir / f"{job_id}.json"
        return file_path if file_path.exists() else None
    
    def cleanup_old_exports(self, days: int = 7):
        """Clean up export files older than specified days."""
        cutoff_time = datetime.now() - timedelta(days=days)
        
        for file_path in self.export_dir.glob("*.json"):
            if file_path.stat().st_mtime < cutoff_time.timestamp():
                file_path.unlink()


@celery_app.task(bind=True)
def export_traffic_data(
    self,
    job_id: str,
    start_date: str,
    end_date: str,
    bbox: Optional[Dict[str, float]] = None,
    export_type: str = "traffic_data",
    granularity: str = "hourly"
):
    """
    Celery task for exporting traffic data to JSON.
    
    Args:
        job_id: Unique identifier for the export job
        start_date: Start date in ISO format
        end_date: End date in ISO format
        bbox: Bounding box for spatial filtering
        export_type: Type of export (traffic_data, chokepoints, incidents)
        granularity: Data granularity (hourly, daily)
    """
    try:
        start_dt = datetime.fromisoformat(start_date)
        end_dt = datetime.fromisoformat(end_date)
        
        # Update progress
        self.update_state(
            state="PROGRESS",
            meta={"progress": 10, "message": "Initializing export..."}
        )
        
        # Get database session
        db = next(get_db())
        
        export_data = {
            "metadata": {
                "export_id": job_id,
                "export_type": export_type,
                "start_date": start_date,
                "end_date": end_date,
                "granularity": granularity,
                "bbox": bbox,
                "generated_at": datetime.now().isoformat(),
                "total_records": 0
            },
            "data": []
        }
        
        if export_type == "traffic_data":
            export_data["data"] = _export_traffic_metrics(
                db, start_dt, end_dt, bbox, granularity, self
            )
        elif export_type == "chokepoints":
            export_data["data"] = _export_chokepoints_data(
                db, start_dt, end_dt, bbox, self
            )
        elif export_type == "comprehensive":
            # Export both traffic data and chokepoints
            self.update_state(
                state="PROGRESS",
                meta={"progress": 30, "message": "Exporting traffic metrics..."}
            )
            traffic_data = _export_traffic_metrics(
                db, start_dt, end_dt, bbox, granularity, self
            )
            
            self.update_state(
                state="PROGRESS",
                meta={"progress": 70, "message": "Exporting chokepoint data..."}
            )
            chokepoint_data = _export_chokepoints_data(
                db, start_dt, end_dt, bbox, self
            )
            
            export_data["data"] = {
                "traffic_metrics": traffic_data,
                "chokepoints": chokepoint_data
            }
        
        # Update metadata with record count
        if isinstance(export_data["data"], list):
            export_data["metadata"]["total_records"] = len(export_data["data"])
        elif isinstance(export_data["data"], dict):
            export_data["metadata"]["total_records"] = sum(
                len(v) if isinstance(v, list) else 1 
                for v in export_data["data"].values()
            )
        
        # Save to file
        self.update_state(
            state="PROGRESS",
            meta={"progress": 90, "message": "Saving export file..."}
        )
        
        export_file = Path("exports") / f"{job_id}.json"
        export_file.parent.mkdir(exist_ok=True)
        
        with open(export_file, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, default=str)
        
        file_size = export_file.stat().st_size
        
        return {
            "progress": 100,
            "message": "Export completed successfully",
            "file_size": file_size,
            "total_records": export_data["metadata"]["total_records"]
        }
        
    except Exception as exc:
        self.update_state(
            state="FAILURE",
            meta={"message": f"Export failed: {str(exc)}"}
        )
        raise exc


def _export_traffic_metrics(
    db: Session,
    start_date: datetime,
    end_date: datetime,
    bbox: Optional[Dict[str, float]],
    granularity: str,
    task
) -> List[Dict[str, Any]]:
    """Export traffic metrics data."""
    query = db.query(TrafficMetric).filter(
        and_(
            TrafficMetric.timestamp >= start_date,
            TrafficMetric.timestamp <= end_date
        )
    )
    
    # Apply spatial filter if bbox provided - using PostGIS geometry
    if bbox:
        from sqlalchemy import text
        spatial_filter = text("""
            ST_Within(location, 
                ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
            )
        """)
        query = query.filter(spatial_filter.params(
            min_lon=bbox["min_lon"],
            min_lat=bbox["min_lat"], 
            max_lon=bbox["max_lon"],
            max_lat=bbox["max_lat"]
        ))
    
    # Apply granularity grouping
    if granularity == "daily":
        query = query.filter(
            func.extract('hour', TrafficMetric.timestamp) == 12  # Noon only
        )
    
    results = query.order_by(TrafficMetric.timestamp).all()
    
    data = []
    total_records = len(results)
    
    for i, record in enumerate(results):
        if i % 100 == 0:  # Update progress every 100 records
            progress = 30 + int((i / total_records) * 40)  # 30-70% range
            task.update_state(
                state="PROGRESS",
                meta={
                    "progress": progress,
                    "message": f"Processing traffic data: {i}/{total_records}"
                }
            )
        
        # Extract coordinates from PostGIS geometry
        from sqlalchemy import func as sql_func
        lon = db.scalar(sql_func.ST_X(record.location))
        lat = db.scalar(sql_func.ST_Y(record.location))
        
        data.append({
            "id": str(record.id),
            "timestamp": record.timestamp.isoformat(),
            "location": {
                "latitude": float(lat) if lat else None,
                "longitude": float(lon) if lon else None
            },
            "road_name": record.road_name,
            "segment_id": record.segment_id,
            "congestion_level": record.congestion_level,
            "congestion_score": record.congestion_score,
            "current_speed": record.current_speed,
            "free_flow_speed": record.free_flow_speed,
            "speed_ratio": record.speed_ratio,
            "delay_minutes": record.delay_minutes,
            "created_at": record.created_at.isoformat() if record.created_at else None
        })
    
    return data


def _export_chokepoints_data(
    db: Session,
    start_date: datetime,
    end_date: datetime,
    bbox: Optional[Dict[str, float]],
    task
) -> List[Dict[str, Any]]:
    """Export chokepoints analysis data."""
    query = db.query(ChokePoint).filter(
        and_(
            ChokePoint.last_updated >= start_date,
            ChokePoint.last_updated <= end_date
        )
    )
    
    # Apply spatial filter if bbox provided - using PostGIS geometry
    if bbox:
        from sqlalchemy import text
        spatial_filter = text("""
            ST_Within(location, 
                ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
            )
        """)
        query = query.filter(spatial_filter.params(
            min_lon=bbox["min_lon"],
            min_lat=bbox["min_lat"], 
            max_lon=bbox["max_lon"],
            max_lat=bbox["max_lat"]
        ))
    
    results = query.order_by(
        ChokePoint.last_updated.desc(),
        ChokePoint.congestion_score.desc()
    ).all()
    
    data = []
    total_records = len(results)
    
    for i, record in enumerate(results):
        if i % 50 == 0:  # Update progress every 50 records
            progress = 70 + int((i / total_records) * 20)  # 70-90% range
            task.update_state(
                state="PROGRESS",
                meta={
                    "progress": progress,
                    "message": f"Processing chokepoints: {i}/{total_records}"
                }
            )
        
        # Extract coordinates from PostGIS geometry
        from sqlalchemy import func as sql_func
        lon = db.scalar(sql_func.ST_X(record.location))
        lat = db.scalar(sql_func.ST_Y(record.location))
        
        data.append({
            "id": str(record.id),
            "last_updated": record.last_updated.isoformat() if record.last_updated else None,
            "location": {
                "latitude": float(lat) if lat else None,
                "longitude": float(lon) if lon else None
            },
            "name": record.name,
            "description": record.description,
            "road_name": record.road_name,
            "congestion_score": record.congestion_score,
            "rank": record.rank,
            "frequency_score": record.frequency_score,
            "intensity_score": record.intensity_score,
            "duration_score": record.duration_score,
            "avg_delay_minutes": record.avg_delay_minutes,
            "max_delay_minutes": record.max_delay_minutes,
            "worst_hour": record.worst_hour,
            "worst_day": record.worst_day,
            "status": record.status,
            "category": record.category,
            "priority": record.priority
        })
    
    return data


# Create service instance
export_service = ExportService()