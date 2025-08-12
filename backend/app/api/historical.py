from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from geoalchemy2 import functions as geo_func
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging

from ..db.session import get_db
from ..models.database import TrafficMetric, DataCollectionJob
from ..models.traffic import TrafficHistoryResponse, TrafficStatsResponse
from ..services.data_collector import DataCollectionService
from ..services.cache import CacheService

logger = logging.getLogger(__name__)
router = APIRouter()
cache_service = CacheService()

@router.get("/historical-traffic", response_model=TrafficHistoryResponse)
async def get_historical_traffic(
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format"),
    bbox: str = Query(..., description="Bounding box as 'min_lon,min_lat,max_lon,max_lat'"),
    granularity: str = Query("hourly", description="Data granularity: hourly, daily, or weekly"),
    road_name: Optional[str] = Query(None, description="Filter by road name"),
    congestion_level: Optional[int] = Query(None, description="Filter by congestion level (0-4)"),
    limit: int = Query(1000, description="Maximum number of records to return"),
    offset: int = Query(0, description="Number of records to skip"),
    db: Session = Depends(get_db)
):
    """
    Get historical traffic data for a specified date range and area
    """
    # Validate date format
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Validate date range
    if start_dt > end_dt:
        raise HTTPException(status_code=400, detail="Start date must be before end date")
    
    if (end_dt - start_dt).days > 90:
        raise HTTPException(status_code=400, detail="Date range cannot exceed 90 days")
    
    # Parse bounding box
    try:
        bbox_coords = [float(x) for x in bbox.split(',')]
        if len(bbox_coords) != 4:
            raise ValueError()
        min_lon, min_lat, max_lon, max_lat = bbox_coords
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid bbox format. Use 'min_lon,min_lat,max_lon,max_lat'"
        )
    
    # Check cache first
    cache_key = f"historical:{start_date}:{end_date}:{bbox}:{granularity}:{road_name}:{congestion_level}:{limit}:{offset}"
    cached_result = await cache_service.get(cache_key)
    if cached_result:
        return cached_result
    
    try:
        # Build query
        query = db.query(TrafficMetric).filter(
            and_(
                TrafficMetric.date >= start_date,
                TrafficMetric.date <= end_date,
                geo_func.ST_Within(
                    TrafficMetric.location,
                    geo_func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
                )
            )
        )
        
        # Apply filters
        if road_name:
            query = query.filter(TrafficMetric.road_name.ilike(f"%{road_name}%"))
        
        if congestion_level is not None:
            query = query.filter(TrafficMetric.congestion_level == congestion_level)
        
        # Apply granularity aggregation
        if granularity == "daily":
            # Group by date
            query = query.order_by(TrafficMetric.date, TrafficMetric.road_name)
        elif granularity == "weekly":
            # This would require more complex aggregation
            query = query.order_by(TrafficMetric.date)
        else:  # hourly (default)
            query = query.order_by(TrafficMetric.timestamp)
        
        # Apply pagination
        total_count = query.count()
        records = query.offset(offset).limit(limit).all()
        
        # Format response
        traffic_data = []
        for record in records:
            # Get coordinates from PostGIS point
            coordinates = db.execute(
                f"SELECT ST_X(location) as lon, ST_Y(location) as lat FROM traffic_metrics WHERE id = {record.id}"
            ).fetchone()
            
            traffic_data.append({
                "id": record.id,
                "location": {
                    "lat": float(coordinates.lat),
                    "lon": float(coordinates.lon)
                },
                "road_name": record.road_name,
                "segment_id": record.segment_id,
                "timestamp": record.timestamp.isoformat(),
                "date": record.date,
                "hour": record.hour,
                "day_of_week": record.day_of_week,
                "speed_kmh": record.speed_kmh,
                "free_flow_speed_kmh": record.free_flow_speed_kmh,
                "congestion_level": record.congestion_level,
                "delay_minutes": record.delay_minutes,
                "relative_speed": record.relative_speed,
                "confidence_level": record.confidence_level
            })
        
        response = TrafficHistoryResponse(
            data=traffic_data,
            total_count=total_count,
            returned_count=len(traffic_data),
            date_range={
                "start": start_date,
                "end": end_date
            },
            granularity=granularity,
            bbox=bbox_coords,
            filters={
                "road_name": road_name,
                "congestion_level": congestion_level
            }
        )
        
        # Cache for 5 minutes
        await cache_service.set(cache_key, response, expire=300)
        return response
        
    except Exception as e:
        logger.error(f"Error fetching historical traffic data: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/traffic-stats", response_model=TrafficStatsResponse)
async def get_traffic_stats(
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format"),
    bbox: str = Query(..., description="Bounding box as 'min_lon,min_lat,max_lon,max_lat'"),
    road_name: Optional[str] = Query(None, description="Filter by road name"),
    db: Session = Depends(get_db)
):
    """
    Get aggregated traffic statistics for analysis
    """
    # Validate inputs (similar to above)
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        bbox_coords = [float(x) for x in bbox.split(',')]
        min_lon, min_lat, max_lon, max_lat = bbox_coords
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date or bbox format")
    
    # Check cache
    cache_key = f"traffic_stats:{start_date}:{end_date}:{bbox}:{road_name}"
    cached_result = await cache_service.get(cache_key)
    if cached_result:
        return cached_result
    
    try:
        # Base query
        base_query = db.query(TrafficMetric).filter(
            and_(
                TrafficMetric.date >= start_date,
                TrafficMetric.date <= end_date,
                geo_func.ST_Within(
                    TrafficMetric.location,
                    geo_func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
                )
            )
        )
        
        if road_name:
            base_query = base_query.filter(TrafficMetric.road_name.ilike(f"%{road_name}%"))
        
        # Overall statistics
        overall_stats = db.query(
            func.avg(TrafficMetric.speed_kmh).label('avg_speed'),
            func.avg(TrafficMetric.delay_minutes).label('avg_delay'),
            func.avg(TrafficMetric.relative_speed).label('avg_relative_speed'),
            func.count(TrafficMetric.id).label('total_observations')
        ).filter(
            base_query.whereclause
        ).first()
        
        # Hourly patterns
        hourly_stats = db.query(
            TrafficMetric.hour,
            func.avg(TrafficMetric.speed_kmh).label('avg_speed'),
            func.avg(TrafficMetric.delay_minutes).label('avg_delay'),
            func.count(TrafficMetric.id).label('observations')
        ).filter(
            base_query.whereclause
        ).group_by(TrafficMetric.hour).order_by(TrafficMetric.hour).all()
        
        # Daily patterns
        daily_stats = db.query(
            TrafficMetric.day_of_week,
            func.avg(TrafficMetric.speed_kmh).label('avg_speed'),
            func.avg(TrafficMetric.delay_minutes).label('avg_delay'),
            func.count(TrafficMetric.id).label('observations')
        ).filter(
            base_query.whereclause
        ).group_by(TrafficMetric.day_of_week).order_by(TrafficMetric.day_of_week).all()
        
        # Congestion level distribution
        congestion_stats = db.query(
            TrafficMetric.congestion_level,
            func.count(TrafficMetric.id).label('count'),
            (func.count(TrafficMetric.id) * 100.0 / overall_stats.total_observations).label('percentage')
        ).filter(
            base_query.whereclause
        ).group_by(TrafficMetric.congestion_level).order_by(TrafficMetric.congestion_level).all()
        
        # Top congested roads
        road_stats = db.query(
            TrafficMetric.road_name,
            func.avg(TrafficMetric.delay_minutes).label('avg_delay'),
            func.max(TrafficMetric.delay_minutes).label('max_delay'),
            func.count(TrafficMetric.id).label('observations')
        ).filter(
            base_query.whereclause
        ).group_by(TrafficMetric.road_name).order_by(
            func.avg(TrafficMetric.delay_minutes).desc()
        ).limit(10).all()
        
        response = TrafficStatsResponse(
            overall={
                "avg_speed_kmh": float(overall_stats.avg_speed or 0),
                "avg_delay_minutes": float(overall_stats.avg_delay or 0),
                "avg_relative_speed": float(overall_stats.avg_relative_speed or 0),
                "total_observations": overall_stats.total_observations
            },
            hourly_patterns=[
                {
                    "hour": stat.hour,
                    "avg_speed_kmh": float(stat.avg_speed),
                    "avg_delay_minutes": float(stat.avg_delay),
                    "observations": stat.observations
                }
                for stat in hourly_stats
            ],
            daily_patterns=[
                {
                    "day_of_week": stat.day_of_week,
                    "avg_speed_kmh": float(stat.avg_speed),
                    "avg_delay_minutes": float(stat.avg_delay),
                    "observations": stat.observations
                }
                for stat in daily_stats
            ],
            congestion_distribution=[
                {
                    "level": stat.congestion_level,
                    "count": stat.count,
                    "percentage": float(stat.percentage)
                }
                for stat in congestion_stats
            ],
            top_congested_roads=[
                {
                    "road_name": stat.road_name,
                    "avg_delay_minutes": float(stat.avg_delay),
                    "max_delay_minutes": float(stat.max_delay),
                    "observations": stat.observations
                }
                for stat in road_stats
            ],
            date_range={
                "start": start_date,
                "end": end_date
            },
            bbox=bbox_coords
        )
        
        # Cache for 10 minutes
        await cache_service.set(cache_key, response, expire=600)
        return response
        
    except Exception as e:
        logger.error(f"Error fetching traffic stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/start-data-collection")
async def start_data_collection(
    background_tasks: BackgroundTasks,
    bbox: str = Query(..., description="Bounding box as 'min_lon,min_lat,max_lon,max_lat'"),
    days_back: int = Query(30, description="Number of days to collect data for"),
    db: Session = Depends(get_db)
):
    """
    Start background data collection for historical traffic data
    """
    try:
        bbox_coords = [float(x) for x in bbox.split(',')]
        if len(bbox_coords) != 4:
            raise ValueError()
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid bbox format. Use 'min_lon,min_lat,max_lon,max_lat'"
        )
    
    if days_back < 1 or days_back > 365:
        raise HTTPException(
            status_code=400,
            detail="days_back must be between 1 and 365"
        )
    
    try:
        collector = DataCollectionService()
        job_id = await collector.start_background_collection(bbox_coords, days_back)
        
        return {
            "message": "Data collection started",
            "job_id": job_id,
            "status": "running",
            "estimated_duration_minutes": days_back * 2  # Rough estimate
        }
        
    except Exception as e:
        logger.error(f"Error starting data collection: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start data collection")

@router.get("/data-collection-status/{job_id}")
async def get_data_collection_status(job_id: int):
    """
    Get status of a data collection job
    """
    try:
        collector = DataCollectionService()
        status = await collector.get_collection_status(job_id)
        
        if "error" in status:
            raise HTTPException(status_code=404, detail=status["error"])
        
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting collection status: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/collection-jobs")
async def list_collection_jobs(
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, description="Maximum number of jobs to return"),
    db: Session = Depends(get_db)
):
    """
    List data collection jobs
    """
    try:
        query = db.query(DataCollectionJob).order_by(DataCollectionJob.created_at.desc())
        
        if status:
            query = query.filter(DataCollectionJob.status == status)
        
        jobs = query.limit(limit).all()
        
        return {
            "jobs": [
                {
                    "job_id": job.id,
                    "job_type": job.job_type,
                    "status": job.status,
                    "created_at": job.created_at.isoformat(),
                    "start_time": job.start_time.isoformat() if job.start_time else None,
                    "end_time": job.end_time.isoformat() if job.end_time else None,
                    "duration_seconds": job.duration_seconds,
                    "records_processed": job.records_processed,
                    "records_inserted": job.records_inserted,
                    "errors_count": job.errors_count,
                    "data_date_range": f"{job.data_date_start} to {job.data_date_end}"
                }
                for job in jobs
            ]
        }
        
    except Exception as e:
        logger.error(f"Error listing collection jobs: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")