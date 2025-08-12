import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc
from geoalchemy2 import functions as geo_func, WKTElement
import json

from ..db.session import get_db
from ..models.database import TrafficMetric, ChokePoint, DataCollectionJob

logger = logging.getLogger(__name__)

class ChokepointAnalyzer:
    """
    Service for analyzing traffic data to identify congestion choke points
    """
    
    def __init__(self):
        self.min_observations = 50  # Minimum observations required for analysis
        self.congestion_threshold = 0.6  # Relative speed threshold for congestion
        self.cluster_radius = 200  # Meters for clustering nearby congestion points
    
    async def analyze_chokepoints(
        self,
        bbox: Optional[List[float]] = None,
        days_back: int = 30,
        job_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Analyze traffic data to identify and rank choke points
        """
        job_start = datetime.utcnow()
        
        # Get or create job record
        db = next(get_db())
        if job_id:
            job = db.query(DataCollectionJob).filter(DataCollectionJob.id == job_id).first()
        else:
            job = DataCollectionJob(
                job_type="chokepoint_analysis",
                status="running",
                start_time=job_start,
                data_date_start=(datetime.utcnow().date() - timedelta(days=days_back)).strftime('%Y-%m-%d'),
                data_date_end=datetime.utcnow().date().strftime('%Y-%m-%d'),
                job_config={
                    "bbox": bbox,
                    "days_back": days_back
                }
            )
            db.add(job)
            db.commit()
            job_id = job.id
        
        try:
            results = {
                "processed": 0,
                "identified": 0,
                "updated": 0,
                "errors": 0
            }
            
            # Step 1: Identify congestion hotspots
            logger.info("Step 1: Identifying congestion hotspots...")
            congestion_locations = await self._identify_congestion_hotspots(db, bbox, days_back)
            results["processed"] = len(congestion_locations)
            
            # Step 2: Cluster nearby congestion points
            logger.info("Step 2: Clustering congestion points...")
            clustered_points = await self._cluster_congestion_points(congestion_locations)
            
            # Step 3: Analyze each cluster to create choke points
            logger.info("Step 3: Analyzing clusters...")
            choke_points = []
            for cluster in clustered_points:
                try:
                    choke_point_data = await self._analyze_cluster(db, cluster, days_back)
                    if choke_point_data:
                        choke_points.append(choke_point_data)
                        results["identified"] += 1
                except Exception as e:
                    logger.error(f"Error analyzing cluster: {str(e)}")
                    results["errors"] += 1
            
            # Step 4: Rank and store choke points
            logger.info("Step 4: Ranking and storing choke points...")
            ranked_choke_points = await self._rank_chokepoints(choke_points)
            stored_count = await self._store_chokepoints(db, ranked_choke_points)
            results["updated"] = stored_count
            
            # Update job status
            job.status = "completed"
            job.end_time = datetime.utcnow()
            job.duration_seconds = int((job.end_time - job.start_time).total_seconds())
            job.records_processed = results["processed"]
            job.records_inserted = results["identified"]
            job.records_updated = results["updated"]
            job.errors_count = results["errors"]
            
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
    
    async def _identify_congestion_hotspots(
        self,
        db: Session,
        bbox: Optional[List[float]],
        days_back: int
    ) -> List[Dict[str, Any]]:
        """
        Identify locations with frequent congestion
        """
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=days_back)
        
        # Base query for congested traffic data
        query = db.query(
            func.ST_X(TrafficMetric.location).label('lon'),
            func.ST_Y(TrafficMetric.location).label('lat'),
            TrafficMetric.road_name,
            TrafficMetric.segment_id,
            func.avg(TrafficMetric.speed_kmh).label('avg_speed'),
            func.avg(TrafficMetric.free_flow_speed_kmh).label('avg_free_flow_speed'),
            func.avg(TrafficMetric.delay_minutes).label('avg_delay'),
            func.max(TrafficMetric.delay_minutes).label('max_delay'),
            func.avg(TrafficMetric.relative_speed).label('avg_relative_speed'),
            func.count(TrafficMetric.id).label('total_observations'),
            func.sum(
                func.case(
                    (TrafficMetric.relative_speed < self.congestion_threshold, 1),
                    else_=0
                )
            ).label('congested_observations')
        ).filter(
            and_(
                TrafficMetric.date >= start_date.strftime('%Y-%m-%d'),
                TrafficMetric.date <= end_date.strftime('%Y-%m-%d'),
                TrafficMetric.relative_speed.isnot(None)
            )
        )
        
        # Apply bbox filter if provided
        if bbox:
            min_lon, min_lat, max_lon, max_lat = bbox
            query = query.filter(
                geo_func.ST_Within(
                    TrafficMetric.location,
                    geo_func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
                )
            )
        
        # Group by location (round coordinates to cluster nearby points)
        query = query.group_by(
            func.round(func.ST_X(TrafficMetric.location), 4),
            func.round(func.ST_Y(TrafficMetric.location), 4),
            TrafficMetric.road_name,
            TrafficMetric.segment_id
        ).having(
            func.count(TrafficMetric.id) >= self.min_observations
        ).having(
            func.sum(
                func.case(
                    (TrafficMetric.relative_speed < self.congestion_threshold, 1),
                    else_=0
                )
            ) > 0
        )
        
        results = query.all()
        
        congestion_locations = []
        for result in results:
            congestion_frequency = result.congested_observations / result.total_observations
            
            # Only consider locations with significant congestion
            if congestion_frequency >= 0.1:  # At least 10% of observations congested
                congestion_locations.append({
                    'lat': float(result.lat),
                    'lon': float(result.lon),
                    'road_name': result.road_name,
                    'segment_id': result.segment_id,
                    'avg_speed': float(result.avg_speed),
                    'avg_free_flow_speed': float(result.avg_free_flow_speed or result.avg_speed),
                    'avg_delay': float(result.avg_delay),
                    'max_delay': float(result.max_delay),
                    'avg_relative_speed': float(result.avg_relative_speed),
                    'total_observations': result.total_observations,
                    'congested_observations': result.congested_observations,
                    'congestion_frequency': congestion_frequency
                })
        
        return sorted(congestion_locations, key=lambda x: x['congestion_frequency'], reverse=True)
    
    async def _cluster_congestion_points(
        self,
        congestion_locations: List[Dict[str, Any]]
    ) -> List[List[Dict[str, Any]]]:
        """
        Cluster nearby congestion points using simple distance-based clustering
        """
        if not congestion_locations:
            return []
        
        clusters = []
        used_indices = set()
        
        for i, location in enumerate(congestion_locations):
            if i in used_indices:
                continue
            
            # Start new cluster
            cluster = [location]
            used_indices.add(i)
            
            # Find nearby points
            for j, other_location in enumerate(congestion_locations):
                if j in used_indices:
                    continue
                
                distance = self._calculate_distance(
                    location['lat'], location['lon'],
                    other_location['lat'], other_location['lon']
                )
                
                if distance <= self.cluster_radius:
                    cluster.append(other_location)
                    used_indices.add(j)
            
            clusters.append(cluster)
        
        return clusters
    
    def _calculate_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calculate approximate distance in meters between two points
        """
        import math
        
        # Haversine formula approximation for short distances
        R = 6371000  # Earth's radius in meters
        
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        
        a = (math.sin(dlat / 2) ** 2 + 
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
             math.sin(dlon / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    async def _analyze_cluster(
        self,
        db: Session,
        cluster: List[Dict[str, Any]],
        days_back: int
    ) -> Optional[Dict[str, Any]]:
        """
        Analyze a cluster of congestion points to create choke point data
        """
        if not cluster:
            return None
        
        # Calculate cluster center (weighted by congestion frequency)
        total_weight = sum(point['congestion_frequency'] for point in cluster)
        center_lat = sum(point['lat'] * point['congestion_frequency'] for point in cluster) / total_weight
        center_lon = sum(point['lon'] * point['congestion_frequency'] for point in cluster) / total_weight
        
        # Get the most representative road name
        road_names = [point['road_name'] for point in cluster if point['road_name']]
        if road_names:
            # Use most common road name
            road_name = max(set(road_names), key=road_names.count)
        else:
            road_name = "Unknown Road"
        
        # Calculate aggregate metrics
        total_observations = sum(point['total_observations'] for point in cluster)
        total_congested = sum(point['congested_observations'] for point in cluster)
        avg_delay = sum(point['avg_delay'] * point['total_observations'] for point in cluster) / total_observations
        max_delay = max(point['max_delay'] for point in cluster)
        avg_relative_speed = sum(point['avg_relative_speed'] * point['total_observations'] for point in cluster) / total_observations
        frequency_score = total_congested / total_observations
        
        # Get detailed hourly and daily patterns
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=days_back)
        
        # Find peak periods by analyzing hourly patterns
        hourly_congestion = db.query(
            TrafficMetric.hour,
            func.avg(TrafficMetric.relative_speed).label('avg_relative_speed'),
            func.avg(TrafficMetric.delay_minutes).label('avg_delay'),
            func.count(TrafficMetric.id).label('observations')
        ).filter(
            and_(
                TrafficMetric.date >= start_date.strftime('%Y-%m-%d'),
                TrafficMetric.date <= end_date.strftime('%Y-%m-%d'),
                func.ST_DWithin(
                    TrafficMetric.location,
                    WKTElement(f"POINT({center_lon} {center_lat})", srid=4326),
                    self.cluster_radius
                )
            )
        ).group_by(TrafficMetric.hour).all()
        
        # Identify peak periods
        peak_periods = []
        worst_hour = 0
        worst_hour_score = 1.0
        
        for hour_data in hourly_congestion:
            congestion_score = 1 - hour_data.avg_relative_speed
            if congestion_score > 0.4:  # Significant congestion
                peak_periods.append({
                    "start": f"{hour_data.hour:02d}:00",
                    "end": f"{(hour_data.hour + 1) % 24:02d}:00",
                    "severity": round(congestion_score, 2),
                    "avg_delay_minutes": round(float(hour_data.avg_delay), 1)
                })
            
            if congestion_score > worst_hour_score:
                worst_hour_score = congestion_score
                worst_hour = hour_data.hour
        
        # Find worst day of week
        daily_congestion = db.query(
            TrafficMetric.day_of_week,
            func.avg(TrafficMetric.relative_speed).label('avg_relative_speed')
        ).filter(
            and_(
                TrafficMetric.date >= start_date.strftime('%Y-%m-%d'),
                TrafficMetric.date <= end_date.strftime('%Y-%m-%d'),
                func.ST_DWithin(
                    TrafficMetric.location,
                    WKTElement(f"POINT({center_lon} {center_lat})", srid=4326),
                    self.cluster_radius
                )
            )
        ).group_by(TrafficMetric.day_of_week).all()
        
        worst_day = 0
        worst_day_score = 1.0
        for day_data in daily_congestion:
            congestion_score = 1 - day_data.avg_relative_speed
            if congestion_score > worst_day_score:
                worst_day_score = congestion_score
                worst_day = day_data.day_of_week
        
        # Calculate composite scores
        intensity_score = 1 - avg_relative_speed  # How severe when congested
        duration_score = len(peak_periods) / 24  # How many hours per day are congested
        
        # Create segment ID
        segment_id = f"choke_{center_lat:.4f}_{center_lon:.4f}"
        
        return {
            'location': {'lat': center_lat, 'lon': center_lon},
            'road_name': road_name,
            'segment_id': segment_id,
            'avg_delay_minutes': avg_delay,
            'max_delay_minutes': max_delay,
            'frequency_score': frequency_score,
            'intensity_score': intensity_score,
            'duration_score': duration_score,
            'peak_periods': peak_periods,
            'worst_hour': worst_hour,
            'worst_day': worst_day,
            'total_observations': total_observations,
            'data_quality_score': min(1.0, total_observations / 1000)  # Quality based on data volume
        }
    
    async def _rank_chokepoints(
        self,
        choke_points: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Calculate congestion scores and rank choke points
        """
        for choke_point in choke_points:
            # Composite congestion score (0-100)
            frequency_weight = 0.4
            intensity_weight = 0.4
            duration_weight = 0.2
            
            score = (
                choke_point['frequency_score'] * frequency_weight +
                choke_point['intensity_score'] * intensity_weight +
                choke_point['duration_score'] * duration_weight
            ) * 100
            
            choke_point['congestion_score'] = round(score, 2)
        
        # Sort by congestion score (highest first) and assign ranks
        choke_points.sort(key=lambda x: x['congestion_score'], reverse=True)
        
        for i, choke_point in enumerate(choke_points):
            choke_point['rank'] = i + 1
        
        return choke_points
    
    async def _store_chokepoints(
        self,
        db: Session,
        choke_points: List[Dict[str, Any]]
    ) -> int:
        """
        Store choke points in database, replacing existing data
        """
        # Clear existing choke points
        db.query(ChokePoint).delete()
        db.commit()
        
        # Insert new choke points
        stored_count = 0
        for cp_data in choke_points:
            choke_point = ChokePoint(
                location=WKTElement(
                    f"POINT({cp_data['location']['lon']} {cp_data['location']['lat']})",
                    srid=4326
                ),
                road_name=cp_data['road_name'],
                segment_id=cp_data['segment_id'],
                congestion_score=cp_data['congestion_score'],
                rank=cp_data['rank'],
                avg_delay_minutes=cp_data['avg_delay_minutes'],
                max_delay_minutes=cp_data['max_delay_minutes'],
                frequency_score=cp_data['frequency_score'],
                intensity_score=cp_data['intensity_score'],
                duration_score=cp_data['duration_score'],
                peak_periods=cp_data['peak_periods'],
                worst_hour=cp_data['worst_hour'],
                worst_day=cp_data['worst_day'],
                last_updated=datetime.utcnow(),
                analysis_date_range=f"{cp_data.get('start_date', '')} to {cp_data.get('end_date', '')}",
                total_observations=cp_data['total_observations'],
                data_quality_score=cp_data['data_quality_score']
            )
            
            db.add(choke_point)
            stored_count += 1
        
        db.commit()
        logger.info(f"Stored {stored_count} choke points in database")
        return stored_count