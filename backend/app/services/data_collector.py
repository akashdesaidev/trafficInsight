"""
Enhanced Data Collection Service for TomTom Traffic Stats API.

This service handles scheduled collection of historical traffic data,
processing, and storage in the database with comprehensive error handling,
monitoring capabilities, and production-ready features.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional, Tuple
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from geoalchemy2 import WKTElement
from geoalchemy2.functions import ST_GeomFromText
import json
import uuid
import time
import random

from ..core.config import get_settings
from ..db.session import get_db
from ..models.database import TrafficMetric, DataCollectionJob, ExportJob
from ..services.cache import CacheService

# Configure logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

class DataCollectionService:
    """
    Service for collecting historical traffic data from TomTom APIs
    """
    
    def __init__(self):
        self.settings = get_settings()
        self.cache = CacheService()
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def collect_traffic_data(
        self,
        bbox: List[float],  # [min_lon, min_lat, max_lon, max_lat]
        start_date: str,    # YYYY-MM-DD
        end_date: str,      # YYYY-MM-DD
        job_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Collect historical traffic data for a specified area and date range
        """
        job_start = datetime.utcnow()
        
        # Create or update job record
        db = next(get_db())
        if job_id:
            job = db.query(DataCollectionJob).filter(DataCollectionJob.id == job_id).first()
        else:
            job = DataCollectionJob(
                job_type="traffic_collection",
                status="running",
                start_time=job_start,
                data_date_start=start_date,
                data_date_end=end_date,
                job_config={
                    "bbox": bbox,
                    "api_source": "tomtom_stats"
                }
            )
            db.add(job)
            db.commit()
            job_id = job.id
        
        try:
            results = {
                "processed": 0,
                "inserted": 0,
                "errors": 0,
                "error_details": []
            }
            
            # Process date range day by day
            current_date = datetime.strptime(start_date, "%Y-%m-%d")
            end_date_dt = datetime.strptime(end_date, "%Y-%m-%d")
            
            while current_date <= end_date_dt:
                date_str = current_date.strftime("%Y-%m-%d")
                logger.info(f"Processing traffic data for {date_str}")
                
                try:
                    daily_results = await self._collect_daily_traffic_data(
                        bbox, date_str, db
                    )
                    results["processed"] += daily_results["processed"]
                    results["inserted"] += daily_results["inserted"]
                    results["errors"] += daily_results["errors"]
                    results["error_details"].extend(daily_results["error_details"])
                    
                    # Update job progress
                    job.records_processed = results["processed"]
                    job.records_inserted = results["inserted"]
                    job.errors_count = results["errors"]
                    db.commit()
                    
                except Exception as e:
                    logger.error(f"Error processing {date_str}: {str(e)}")
                    results["errors"] += 1
                    results["error_details"].append({
                        "date": date_str,
                        "error": str(e)
                    })
                
                current_date += timedelta(days=1)
                
                # Add delay to respect API rate limits
                await asyncio.sleep(1)
            
            # Complete job
            job.status = "completed" if results["errors"] == 0 else "completed_with_errors"
            job.end_time = datetime.utcnow()
            job.duration_seconds = int((job.end_time - job.start_time).total_seconds())
            job.records_processed = results["processed"]
            job.records_inserted = results["inserted"]
            job.errors_count = results["errors"]
            if results["error_details"]:
                job.error_details = results["error_details"]
            
            db.commit()
            return results
            
        except Exception as e:
            # Mark job as failed
            job.status = "failed"
            job.end_time = datetime.utcnow()
            job.error_message = str(e)
            db.commit()
            raise
        
        finally:
            db.close()
    
    async def _collect_daily_traffic_data(
        self,
        bbox: List[float],
        date: str,
        db: Session
    ) -> Dict[str, Any]:
        """
        Collect traffic data for a specific date
        """
        results = {
            "processed": 0,
            "inserted": 0,
            "errors": 0,
            "error_details": []
        }
        
        # For now, we'll simulate data collection since TomTom Stats API requires special access
        # In production, this would call the actual TomTom Traffic Stats API
        sample_locations = self._generate_sample_locations(bbox)
        
        for location in sample_locations:
            try:
                # Simulate hourly data for the date
                for hour in range(24):
                    traffic_data = self._generate_sample_traffic_data(
                        location, date, hour
                    )
                    
                    # Create traffic metric record
                    metric = TrafficMetric(
                        location=WKTElement(f"POINT({location['lon']} {location['lat']})", srid=4326),
                        road_name=location.get("road_name", "Unknown Road"),
                        segment_id=location.get("segment_id", f"seg_{location['lat']:.4f}_{location['lon']:.4f}"),
                        timestamp=datetime.strptime(f"{date} {hour:02d}:00:00", "%Y-%m-%d %H:%M:%S"),
                        date=date,
                        hour=hour,
                        day_of_week=datetime.strptime(date, "%Y-%m-%d").weekday(),
                        speed_kmh=traffic_data["speed_kmh"],
                        free_flow_speed_kmh=traffic_data["free_flow_speed_kmh"],
                        current_travel_time_minutes=traffic_data["current_travel_time_minutes"],
                        free_flow_travel_time_minutes=traffic_data["free_flow_travel_time_minutes"],
                        confidence_level=traffic_data["confidence_level"],
                        congestion_level=traffic_data["congestion_level"],
                        delay_minutes=traffic_data["delay_minutes"],
                        relative_speed=traffic_data["relative_speed"],
                        data_source="tomtom_simulated",
                        raw_data=traffic_data
                    )
                    
                    db.add(metric)
                    results["inserted"] += 1
                    
                results["processed"] += 1
                
            except Exception as e:
                logger.error(f"Error processing location {location}: {str(e)}")
                results["errors"] += 1
                results["error_details"].append({
                    "location": location,
                    "error": str(e)
                })
        
        # Commit batch
        db.commit()
        return results
    
    def _generate_sample_locations(self, bbox: List[float]) -> List[Dict[str, Any]]:
        """
        Generate sample locations within bounding box for demonstration
        In production, this would come from actual road network data
        """
        import random
        
        min_lon, min_lat, max_lon, max_lat = bbox
        locations = []
        
        # Major roads in Bangalore area (example)
        road_names = [
            "Outer Ring Road", "Hosur Road", "Airport Road", "Bannerghatta Road",
            "Whitefield Road", "Electronic City", "Koramangala Main Road",
            "Indiranagar 100 Feet Road", "MG Road", "Brigade Road"
        ]
        
        for i in range(20):  # Generate 20 sample locations
            lat = random.uniform(min_lat, max_lat)
            lon = random.uniform(min_lon, max_lon)
            
            locations.append({
                "lat": lat,
                "lon": lon,
                "road_name": random.choice(road_names),
                "segment_id": f"seg_{i:03d}_{lat:.4f}_{lon:.4f}"
            })
        
        return locations
    
    def _generate_sample_traffic_data(
        self,
        location: Dict[str, Any],
        date: str,
        hour: int
    ) -> Dict[str, Any]:
        """
        Generate realistic sample traffic data
        In production, this would be actual API response data
        """
        import random
        import math
        
        # Base free flow speed (varies by road type)
        free_flow_speed = random.uniform(40, 80)  # km/h
        
        # Traffic patterns (rush hours have more congestion)
        congestion_factor = 1.0
        
        # Morning rush (7-10 AM)
        if 7 <= hour <= 10:
            congestion_factor = random.uniform(0.3, 0.7)
        # Evening rush (6-9 PM)
        elif 18 <= hour <= 21:
            congestion_factor = random.uniform(0.2, 0.6)
        # Night hours (less traffic)
        elif hour < 6 or hour > 22:
            congestion_factor = random.uniform(0.8, 1.0)
        # Regular hours
        else:
            congestion_factor = random.uniform(0.6, 0.9)
        
        # Add weekend effects
        day_of_week = datetime.strptime(date, "%Y-%m-%d").weekday()
        if day_of_week >= 5:  # Weekend
            congestion_factor = min(congestion_factor + 0.2, 1.0)
        
        # Calculate traffic metrics
        current_speed = free_flow_speed * congestion_factor
        relative_speed = congestion_factor
        
        # Travel times (assume 1km segment)
        free_flow_travel_time = 60 / free_flow_speed  # minutes per km
        current_travel_time = 60 / current_speed
        delay = current_travel_time - free_flow_travel_time
        
        # Congestion level (0-4)
        if relative_speed > 0.8:
            congestion_level = 0  # Free flow
        elif relative_speed > 0.6:
            congestion_level = 1  # Light traffic
        elif relative_speed > 0.4:
            congestion_level = 2  # Moderate traffic
        elif relative_speed > 0.2:
            congestion_level = 3  # Heavy traffic
        else:
            congestion_level = 4  # Severe congestion
        
        return {
            "speed_kmh": round(current_speed, 2),
            "free_flow_speed_kmh": round(free_flow_speed, 2),
            "current_travel_time_minutes": round(current_travel_time, 2),
            "free_flow_travel_time_minutes": round(free_flow_travel_time, 2),
            "confidence_level": random.uniform(0.7, 1.0),
            "congestion_level": congestion_level,
            "delay_minutes": round(max(0, delay), 2),
            "relative_speed": round(relative_speed, 3),
            "timestamp": f"{date} {hour:02d}:00:00",
            "location": location
        }
    
    async def start_background_collection(
        self,
        bbox: List[float],
        days_back: int = 30
    ) -> int:
        """
        Start background data collection job for recent historical data
        """
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=days_back)
        
        db = next(get_db())
        job = DataCollectionJob(
            job_type="traffic_collection",
            status="pending",
            data_date_start=start_date.strftime("%Y-%m-%d"),
            data_date_end=end_date.strftime("%Y-%m-%d"),
            job_config={
                "bbox": bbox,
                "days_back": days_back,
                "background": True
            }
        )
        db.add(job)
        db.commit()
        job_id = job.id
        db.close()
        
        # Start collection in background
        asyncio.create_task(
            self.collect_traffic_data(
                bbox,
                start_date.strftime("%Y-%m-%d"),
                end_date.strftime("%Y-%m-%d"),
                job_id
            )
        )
        
        return job_id
    
    async def get_collection_status(self, job_id: int) -> Dict[str, Any]:
        """
        Get status of a data collection job
        """
        db = next(get_db())
        job = db.query(DataCollectionJob).filter(DataCollectionJob.id == job_id).first()
        db.close()
        
        if not job:
            return {"error": "Job not found"}
        
        return {
            "job_id": job.id,
            "status": job.status,
            "start_time": job.start_time.isoformat() if job.start_time else None,
            "end_time": job.end_time.isoformat() if job.end_time else None,
            "duration_seconds": job.duration_seconds,
            "records_processed": job.records_processed,
            "records_inserted": job.records_inserted,
            "errors_count": job.errors_count,
            "data_date_range": f"{job.data_date_start} to {job.data_date_end}",
            "progress": self._calculate_progress(job)
        }
    
    def _calculate_progress(self, job: DataCollectionJob) -> float:
        """
        Calculate job progress percentage
        """
        if job.status == "completed":
            return 100.0
        elif job.status == "failed":
            return 0.0
        elif not job.start_time:
            return 0.0
        
        # Estimate based on date range processing
        start_date = datetime.strptime(job.data_date_start, "%Y-%m-%d")
        end_date = datetime.strptime(job.data_date_end, "%Y-%m-%d")
        total_days = (end_date - start_date).days + 1
        
        if job.records_processed > 0:
            # Rough estimate: assume ~20 locations per day
            estimated_records_per_day = 20 * 24  # 20 locations * 24 hours
            estimated_days_processed = job.records_processed / estimated_records_per_day
            return min(100.0, (estimated_days_processed / total_days) * 100)
        
        return 5.0  # Started but no records yet
    
    async def cleanup_old_jobs(self, days_old: int = 7):
        """
        Clean up old completed job records
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days_old)
        
        db = next(get_db())
        deleted = db.query(DataCollectionJob).filter(
            DataCollectionJob.status.in_(["completed", "failed"]),
            DataCollectionJob.created_at < cutoff_date
        ).delete()
        db.commit()
        db.close()
        
        logger.info(f"Cleaned up {deleted} old job records")