from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc
from geoalchemy2 import functions as geo_func
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging

from ..db.session import get_db
from ..models.database import ChokePoint, TrafficMetric, DataCollectionJob
from ..services.cache import CacheService
from ..services.chokepoint_analyzer import ChokepointAnalyzer

logger = logging.getLogger(__name__)
router = APIRouter()
cache_service = CacheService()

@router.get("/top-chokepoints")
async def get_top_chokepoints(
    limit: int = Query(10, description="Maximum number of choke points to return"),
    bbox: Optional[str] = Query(None, description="Bounding box as 'min_lon,min_lat,max_lon,max_lat'"),
    min_score: Optional[float] = Query(None, description="Minimum congestion score (0-100)"),
    road_name: Optional[str] = Query(None, description="Filter by road name"),
    db: Session = Depends(get_db)
):
    """
    Get top-ranked traffic choke points
    """
    # Check cache first
    cache_key = f"top_chokepoints:{limit}:{bbox}:{min_score}:{road_name}"
    cached_result = await cache_service.get(cache_key)
    if cached_result:
        return cached_result

    try:
        # Build query
        query = db.query(ChokePoint).order_by(desc(ChokePoint.congestion_score))
        
        # Apply filters
        if bbox:
            try:
                bbox_coords = [float(x) for x in bbox.split(',')]
                if len(bbox_coords) != 4:
                    raise ValueError()
                min_lon, min_lat, max_lon, max_lat = bbox_coords
                
                query = query.filter(
                    geo_func.ST_Within(
                        ChokePoint.location,
                        geo_func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
                    )
                )
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid bbox format. Use 'min_lon,min_lat,max_lon,max_lat'"
                )
        
        if min_score is not None:
            query = query.filter(ChokePoint.congestion_score >= min_score)
        
        if road_name:
            query = query.filter(ChokePoint.road_name.ilike(f"%{road_name}%"))
        
        # Apply limit
        choke_points = query.limit(limit).all()
        
        # Format response
        result = {
            "choke_points": [],
            "total_count": query.count(),
            "returned_count": len(choke_points),
            "filters": {
                "bbox": bbox,
                "min_score": min_score,
                "road_name": road_name
            }
        }
        
        for cp in choke_points:
            # Get coordinates from PostGIS point
            coordinates = db.execute(
                f"SELECT ST_X(location) as lon, ST_Y(location) as lat FROM choke_points WHERE id = {cp.id}"
            ).fetchone()
            
            result["choke_points"].append({
                "id": cp.id,
                "location": {
                    "lat": float(coordinates.lat),
                    "lon": float(coordinates.lon)
                },
                "road_name": cp.road_name,
                "segment_id": cp.segment_id,
                "congestion_score": cp.congestion_score,
                "rank": cp.rank,
                "avg_delay_minutes": cp.avg_delay_minutes,
                "max_delay_minutes": cp.max_delay_minutes,
                "frequency_score": cp.frequency_score,
                "intensity_score": cp.intensity_score,
                "duration_score": cp.duration_score,
                "peak_periods": cp.peak_periods,
                "worst_hour": cp.worst_hour,
                "worst_day": cp.worst_day,
                "last_updated": cp.last_updated.isoformat() if cp.last_updated else None,
                "total_observations": cp.total_observations,
                "data_quality_score": cp.data_quality_score
            })
        
        # Cache for 15 minutes
        await cache_service.set(cache_key, result, expire=900)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching top choke points: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/chokepoint-details/{chokepoint_id}")
async def get_chokepoint_details(
    chokepoint_id: int,
    days_back: int = Query(30, description="Number of days of historical data to include"),
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a specific choke point
    """
    # Check cache first
    cache_key = f"chokepoint_details:{chokepoint_id}:{days_back}"
    cached_result = await cache_service.get(cache_key)
    if cached_result:
        return cached_result

    try:
        # Get choke point details
        choke_point = db.query(ChokePoint).filter(ChokePoint.id == chokepoint_id).first()
        if not choke_point:
            raise HTTPException(status_code=404, detail="Choke point not found")
        
        # Get coordinates
        coordinates = db.execute(
            f"SELECT ST_X(location) as lon, ST_Y(location) as lat FROM choke_points WHERE id = {choke_point.id}"
        ).fetchone()
        
        # Get historical traffic data for this location
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=days_back)
        
        # Query traffic metrics near this choke point (within 100m radius)
        historical_data = db.query(
            TrafficMetric.date,
            TrafficMetric.hour,
            func.avg(TrafficMetric.speed_kmh).label('avg_speed'),
            func.avg(TrafficMetric.delay_minutes).label('avg_delay'),
            func.avg(TrafficMetric.relative_speed).label('avg_relative_speed'),
            func.count(TrafficMetric.id).label('observations')
        ).filter(
            and_(
                TrafficMetric.date >= start_date.strftime('%Y-%m-%d'),
                TrafficMetric.date <= end_date.strftime('%Y-%m-%d'),
                geo_func.ST_DWithin(
                    TrafficMetric.location,
                    choke_point.location,
                    100  # 100 meter radius
                )
            )
        ).group_by(
            TrafficMetric.date, TrafficMetric.hour
        ).order_by(
            TrafficMetric.date, TrafficMetric.hour
        ).all()
        
        # Hourly pattern analysis
        hourly_patterns = db.query(
            TrafficMetric.hour,
            func.avg(TrafficMetric.speed_kmh).label('avg_speed'),
            func.avg(TrafficMetric.delay_minutes).label('avg_delay'),
            func.max(TrafficMetric.delay_minutes).label('max_delay'),
            func.count(TrafficMetric.id).label('observations')
        ).filter(
            and_(
                TrafficMetric.date >= start_date.strftime('%Y-%m-%d'),
                TrafficMetric.date <= end_date.strftime('%Y-%m-%d'),
                geo_func.ST_DWithin(
                    TrafficMetric.location,
                    choke_point.location,
                    100
                )
            )
        ).group_by(
            TrafficMetric.hour
        ).order_by(
            TrafficMetric.hour
        ).all()
        
        # Daily pattern analysis
        daily_patterns = db.query(
            TrafficMetric.day_of_week,
            func.avg(TrafficMetric.speed_kmh).label('avg_speed'),
            func.avg(TrafficMetric.delay_minutes).label('avg_delay'),
            func.max(TrafficMetric.delay_minutes).label('max_delay'),
            func.count(TrafficMetric.id).label('observations')
        ).filter(
            and_(
                TrafficMetric.date >= start_date.strftime('%Y-%m-%d'),
                TrafficMetric.date <= end_date.strftime('%Y-%m-%d'),
                geo_func.ST_DWithin(
                    TrafficMetric.location,
                    choke_point.location,
                    100
                )
            )
        ).group_by(
            TrafficMetric.day_of_week
        ).order_by(
            TrafficMetric.day_of_week
        ).all()
        
        # Format response
        result = {
            "choke_point": {
                "id": choke_point.id,
                "location": {
                    "lat": float(coordinates.lat),
                    "lon": float(coordinates.lon)
                },
                "road_name": choke_point.road_name,
                "segment_id": choke_point.segment_id,
                "congestion_score": choke_point.congestion_score,
                "rank": choke_point.rank,
                "avg_delay_minutes": choke_point.avg_delay_minutes,
                "max_delay_minutes": choke_point.max_delay_minutes,
                "frequency_score": choke_point.frequency_score,
                "intensity_score": choke_point.intensity_score,
                "duration_score": choke_point.duration_score,
                "peak_periods": choke_point.peak_periods,
                "worst_hour": choke_point.worst_hour,
                "worst_day": choke_point.worst_day,
                "last_updated": choke_point.last_updated.isoformat() if choke_point.last_updated else None,
                "total_observations": choke_point.total_observations,
                "data_quality_score": choke_point.data_quality_score
            },
            "historical_data": [
                {
                    "date": str(item.date),
                    "hour": item.hour,
                    "avg_speed_kmh": float(item.avg_speed),
                    "avg_delay_minutes": float(item.avg_delay),
                    "avg_relative_speed": float(item.avg_relative_speed),
                    "observations": item.observations
                }
                for item in historical_data
            ],
            "hourly_patterns": [
                {
                    "hour": item.hour,
                    "avg_speed_kmh": float(item.avg_speed),
                    "avg_delay_minutes": float(item.avg_delay),
                    "max_delay_minutes": float(item.max_delay),
                    "observations": item.observations
                }
                for item in hourly_patterns
            ],
            "daily_patterns": [
                {
                    "day_of_week": item.day_of_week,
                    "avg_speed_kmh": float(item.avg_speed),
                    "avg_delay_minutes": float(item.avg_delay),
                    "max_delay_minutes": float(item.max_delay),
                    "observations": item.observations
                }
                for item in daily_patterns
            ],
            "analysis_period": {
                "start_date": start_date.strftime('%Y-%m-%d'),
                "end_date": end_date.strftime('%Y-%m-%d'),
                "days": days_back
            }
        }
        
        # Cache for 10 minutes
        await cache_service.set(cache_key, result, expire=600)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching choke point details: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/analyze-chokepoints")
async def analyze_chokepoints(
    background_tasks: BackgroundTasks,
    bbox: Optional[str] = Query(None, description="Bounding box as 'min_lon,min_lat,max_lon,max_lat'"),
    days_back: int = Query(30, description="Number of days to analyze"),
    force_refresh: bool = Query(False, description="Force refresh even if recent analysis exists"),
    db: Session = Depends(get_db)
):
    """
    Start choke point analysis job
    """
    try:
        # Check for recent analysis
        if not force_refresh:
            cutoff_time = datetime.utcnow() - timedelta(hours=6)  # 6 hours
            recent_analysis = db.query(DataCollectionJob).filter(
                and_(
                    DataCollectionJob.job_type == "chokepoint_analysis",
                    DataCollectionJob.status == "completed",
                    DataCollectionJob.end_time > cutoff_time
                )
            ).first()
            
            if recent_analysis:
                return {
                    "message": "Recent analysis found",
                    "job_id": recent_analysis.id,
                    "status": "completed",
                    "last_analysis": recent_analysis.end_time.isoformat(),
                    "note": "Use force_refresh=true to run new analysis"
                }
        
        # Parse bbox if provided
        bbox_coords = None
        if bbox:
            try:
                bbox_coords = [float(x) for x in bbox.split(',')]
                if len(bbox_coords) != 4:
                    raise ValueError()
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid bbox format. Use 'min_lon,min_lat,max_lon,max_lat'"
                )
        
        # Create analysis job
        job = DataCollectionJob(
            job_type="chokepoint_analysis",
            status="pending",
            data_date_start=(datetime.utcnow().date() - timedelta(days=days_back)).strftime('%Y-%m-%d'),
            data_date_end=datetime.utcnow().date().strftime('%Y-%m-%d'),
            job_config={
                "bbox": bbox_coords,
                "days_back": days_back,
                "force_refresh": force_refresh
            }
        )
        db.add(job)
        db.commit()
        job_id = job.id
        
        # Start analysis in background
        analyzer = ChokepointAnalyzer()
        background_tasks.add_task(
            analyzer.analyze_chokepoints,
            bbox_coords,
            days_back,
            job_id
        )
        
        return {
            "message": "Choke point analysis started",
            "job_id": job_id,
            "status": "running",
            "estimated_duration_minutes": max(5, days_back // 6)  # Rough estimate
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting choke point analysis: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start analysis")

@router.get("/chokepoint-analysis-status/{job_id}")
async def get_chokepoint_analysis_status(job_id: int, db: Session = Depends(get_db)):
    """
    Get status of a choke point analysis job
    """
    try:
        job = db.query(DataCollectionJob).filter(
            and_(
                DataCollectionJob.id == job_id,
                DataCollectionJob.job_type == "chokepoint_analysis"
            )
        ).first()
        
        if not job:
            raise HTTPException(status_code=404, detail="Analysis job not found")
        
        # Count current choke points if job completed
        choke_points_count = 0
        if job.status == "completed":
            choke_points_count = db.query(ChokePoint).count()
        
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
            "choke_points_identified": choke_points_count,
            "error_message": job.error_message
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting analysis status: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/chokepoint-summary")
async def get_chokepoint_summary(
    bbox: Optional[str] = Query(None, description="Bounding box as 'min_lon,min_lat,max_lon,max_lat'"),
    db: Session = Depends(get_db)
):
    """
    Get summary statistics about choke points
    """
    # Check cache first
    cache_key = f"chokepoint_summary:{bbox}"
    cached_result = await cache_service.get(cache_key)
    if cached_result:
        return cached_result

    try:
        # Base query
        query = db.query(ChokePoint)
        
        # Apply bbox filter if provided
        if bbox:
            try:
                bbox_coords = [float(x) for x in bbox.split(',')]
                if len(bbox_coords) != 4:
                    raise ValueError()
                min_lon, min_lat, max_lon, max_lat = bbox_coords
                
                query = query.filter(
                    geo_func.ST_Within(
                        ChokePoint.location,
                        geo_func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
                    )
                )
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid bbox format. Use 'min_lon,min_lat,max_lon,max_lat'"
                )
        
        # Get summary statistics
        total_count = query.count()
        
        if total_count == 0:
            return {
                "total_chokepoints": 0,
                "average_congestion_score": 0,
                "severity_distribution": {},
                "top_roads": [],
                "last_analysis": None,
                "bbox": bbox
            }
        
        # Average congestion score
        avg_score = db.query(func.avg(ChokePoint.congestion_score)).filter(
            query.whereclause
        ).scalar()
        
        # Severity distribution
        severity_ranges = [
            (0, 20, "Low"),
            (20, 40, "Moderate"),
            (40, 60, "High"),
            (60, 80, "Severe"),
            (80, 100, "Critical")
        ]
        
        severity_distribution = {}
        for min_score, max_score, label in severity_ranges:
            count = query.filter(
                and_(
                    ChokePoint.congestion_score >= min_score,
                    ChokePoint.congestion_score < max_score
                )
            ).count()
            severity_distribution[label] = {
                "count": count,
                "percentage": (count / total_count) * 100 if total_count > 0 else 0
            }
        
        # Top roads by average congestion score
        top_roads = db.query(
            ChokePoint.road_name,
            func.avg(ChokePoint.congestion_score).label('avg_score'),
            func.count(ChokePoint.id).label('count')
        ).filter(
            query.whereclause
        ).group_by(
            ChokePoint.road_name
        ).order_by(
            func.avg(ChokePoint.congestion_score).desc()
        ).limit(5).all()
        
        # Last analysis time
        last_analysis = db.query(DataCollectionJob).filter(
            and_(
                DataCollectionJob.job_type == "chokepoint_analysis",
                DataCollectionJob.status == "completed"
            )
        ).order_by(DataCollectionJob.end_time.desc()).first()
        
        result = {
            "total_chokepoints": total_count,
            "average_congestion_score": float(avg_score) if avg_score else 0,
            "severity_distribution": severity_distribution,
            "top_roads": [
                {
                    "road_name": road.road_name,
                    "avg_congestion_score": float(road.avg_score),
                    "chokepoint_count": road.count
                }
                for road in top_roads
            ],
            "last_analysis": last_analysis.end_time.isoformat() if last_analysis else None,
            "bbox": bbox
        }
        
        # Cache for 30 minutes
        await cache_service.set(cache_key, result, expire=1800)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching choke point summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")