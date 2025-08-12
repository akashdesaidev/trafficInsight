from sqlalchemy import Column, Integer, String, DateTime, Float, JSON, Index, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geometry
from datetime import datetime
import uuid

Base = declarative_base()

class TrafficMetric(Base):
    """
    Enhanced time-series traffic metrics table optimized for historical analysis.
    
    Stores aggregated traffic data points with spatial coordinates and temporal indexing
    for efficient time-series queries and analytics.
    """
    __tablename__ = "traffic_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Enhanced spatial data with PostGIS geometry (SRID 4326 for WGS84)
    location = Column(Geometry('POINT', srid=4326), nullable=False)
    
    # Road information
    road_name = Column(String(255), index=True)
    segment_id = Column(String(100), index=True)
    road_type = Column(String(50))  # highway, arterial, local, etc.
    road_closure = Column(Boolean, default=False)
    
    # Enhanced time-series data
    timestamp = Column(DateTime, nullable=False, index=True)
    date = Column(String(10), index=True)  # YYYY-MM-DD format for easy querying
    hour = Column(Integer, index=True)  # 0-23 for hourly analysis
    day_of_week = Column(Integer, index=True)  # 0-6 (Monday=0)
    week_of_year = Column(Integer)  # 1-53 for seasonal patterns
    month = Column(Integer, index=True)  # 1-12 for monthly patterns
    
    # Core traffic metrics
    current_speed = Column(Float, nullable=False)
    free_flow_speed = Column(Float, nullable=False)
    speed_ratio = Column(Float, nullable=False)  # current_speed / free_flow_speed
    current_travel_time_minutes = Column(Float)
    free_flow_travel_time_minutes = Column(Float)
    delay_minutes = Column(Float)
    
    # Enhanced congestion classification
    congestion_level = Column(String(20), index=True)  # free, moderate, slow, heavy, severe
    congestion_score = Column(Integer, nullable=False, index=True)  # 0-100 scale
    jam_factor = Column(Float)  # TomTom's jam factor metric
    
    # Data quality and source
    confidence_level = Column(Float, default=1.0)  # 0.0-1.0
    data_source = Column(String(50), default="tomtom_stats")
    data_quality_score = Column(Float, default=1.0)
    
    # Weather and external factors (for future enhancement)
    weather_condition = Column(String(50))
    temperature_celsius = Column(Float)
    precipitation_mm = Column(Float)
    special_event = Column(String(200))
    
    # Metadata
    raw_data = Column(JSON)  # Store original API response for debugging
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Optimized composite indexes for time-series analysis
    __table_args__ = (
        Index('idx_traffic_location_time', 'location', 'timestamp'),
        Index('idx_traffic_temporal_patterns', 'hour', 'day_of_week', 'month'),
        Index('idx_traffic_congestion_analysis', 'congestion_level', 'congestion_score', 'timestamp'),
        Index('idx_traffic_road_analysis', 'road_name', 'date'),
        Index('idx_traffic_segment_time', 'segment_id', 'timestamp'),
        Index('idx_traffic_speed_analysis', 'speed_ratio', 'timestamp'),
        Index('idx_traffic_spatial_temporal', 'location', 'date', 'hour'),
    )

class ChokePoint(Base):
    """
    Enhanced choke points table with comprehensive analysis data.
    
    Stores persistent congestion hotspots identified through historical analysis
    with detailed ranking, temporal patterns, and impact metrics.
    """
    __tablename__ = "choke_points"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Location data with enhanced geometric support
    location = Column(Geometry('POINT', srid=4326), nullable=False)
    name = Column(String(200), nullable=False)  # Human-readable location name
    description = Column(Text)
    
    # Geographic boundaries for the choke point area
    boundary = Column(Geometry('POLYGON', srid=4326))
    
    # Road information
    road_name = Column(String(255), nullable=False)
    road_names = Column(Text)  # JSON array of all affected road names
    segment_id = Column(String(100), index=True)
    road_types = Column(String(100))  # Types of roads affected
    
    # Enhanced ranking metrics
    congestion_score = Column(Float, nullable=False, index=True)  # 0-100 overall score
    rank = Column(Integer, index=True)  # Global ranking
    frequency_score = Column(Float, nullable=False)   # How often it's congested (0-1)
    intensity_score = Column(Float, nullable=False)   # How severe the congestion (0-1)
    duration_score = Column(Float, nullable=False)    # How long congestion lasts (0-1)
    impact_score = Column(Float)  # Economic/social impact score (0-1)
    
    # Detailed statistics
    avg_delay_minutes = Column(Float)
    max_delay_minutes = Column(Float)
    avg_speed_reduction_percent = Column(Float)
    worst_speed_reduction_percent = Column(Float)
    
    # Temporal patterns with enhanced detail
    peak_morning_start = Column(Integer)  # Hour when morning peak starts
    peak_morning_end = Column(Integer)    # Hour when morning peak ends
    peak_evening_start = Column(Integer)  # Hour when evening peak starts
    peak_evening_end = Column(Integer)    # Hour when evening peak ends
    worst_hour = Column(Integer)  # Hour with highest congestion overall
    worst_day = Column(Integer)  # Day of week with highest congestion
    
    # Weekly patterns (comma-separated day indices, e.g., "0,1,2,3,4" for weekdays)
    high_congestion_days = Column(String(20))
    
    # Peak periods with enhanced structure
    peak_periods = Column(JSON)  # Detailed peak period analysis
    
    # Analysis metadata
    data_points_analyzed = Column(Integer, default=0)
    analysis_period_start = Column(DateTime)
    analysis_period_end = Column(DateTime)
    total_observations = Column(Integer)
    data_quality_score = Column(Float, default=1.0)  # 0-1 based on data completeness
    
    # Status and classification
    status = Column(String(20), default='active')  # active, resolved, monitoring
    category = Column(String(50))  # intersection, highway_merge, construction, etc.
    priority = Column(String(10), default='medium')  # low, medium, high, critical
    
    # Update tracking
    last_updated = Column(DateTime, default=datetime.utcnow)
    analysis_date_range = Column(String(50))  # e.g., "2024-01-01_to_2024-01-31"
    next_analysis_due = Column(DateTime)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Enhanced indexes for efficient choke point queries
    __table_args__ = (
        Index('idx_choke_ranking', 'congestion_score', 'rank', 'status'),
        Index('idx_choke_location', 'location'),
        Index('idx_choke_temporal', 'last_updated', 'status'),
        Index('idx_choke_priority', 'priority', 'congestion_score'),
        Index('idx_choke_analysis', 'analysis_period_start', 'analysis_period_end'),
        Index('idx_choke_category', 'category', 'status'),
    )

class DataCollectionJob(Base):
    """
    Enhanced data collection job tracking with comprehensive monitoring.
    
    Tracks the health of the data pipeline and provides detailed logging
    for troubleshooting and performance optimization.
    """
    __tablename__ = "data_collection_jobs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Job information
    job_type = Column(String(50), nullable=False)  # traffic_stats, incidents, chokepoint_analysis
    job_status = Column(String(20), default='queued')  # queued, running, completed, failed, cancelled
    job_priority = Column(String(10), default='normal')  # low, normal, high, critical
    
    # Timing data
    queued_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    duration_seconds = Column(Float)
    
    # Data range processed
    data_date_start = Column(String(10))  # YYYY-MM-DD
    data_date_end = Column(String(10))
    spatial_bounds = Column(Geometry('POLYGON', srid=4326))  # Geographic area processed
    
    # Enhanced results tracking
    records_processed = Column(Integer, default=0)
    records_inserted = Column(Integer, default=0)
    records_updated = Column(Integer, default=0)
    records_skipped = Column(Integer, default=0)  # Duplicates or invalid data
    records_failed = Column(Integer, default=0)
    
    # API usage tracking
    api_calls_made = Column(Integer, default=0)
    api_rate_limit_hit = Column(Boolean, default=False)
    api_quota_used = Column(Integer, default=0)
    
    # Performance metrics
    avg_processing_time_per_record = Column(Float)
    memory_peak_mb = Column(Float)
    cpu_time_seconds = Column(Float)
    
    # Error tracking
    error_message = Column(Text)
    error_details = Column(JSON)  # Detailed error information
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    
    # Configuration and metadata
    job_config = Column(JSON)  # Store job parameters
    environment = Column(String(20), default='production')  # dev, staging, production
    version = Column(String(20))  # Application version when job ran
    
    # Workflow management
    parent_job_id = Column(UUID(as_uuid=True))  # For dependent jobs
    workflow_name = Column(String(100))  # Name of the workflow this job belongs to
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Enhanced indexes for monitoring and analysis
    __table_args__ = (
        Index('idx_job_monitoring', 'job_type', 'job_status', 'started_at'),
        Index('idx_job_performance', 'job_type', 'duration_seconds'),
        Index('idx_job_errors', 'job_status', 'error_message', 'started_at'),
        Index('idx_job_workflow', 'workflow_name', 'started_at'),
        Index('idx_job_data_range', 'data_date_start', 'data_date_end'),
        Index('idx_job_spatial', 'spatial_bounds'),
    )


class ExportJob(Base):
    """
    Track data export jobs for JSON export functionality.
    
    Manages async export requests and provides status tracking for users
    with comprehensive configuration and result management.
    """
    __tablename__ = "export_jobs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Export parameters
    export_name = Column(String(200))  # User-friendly name for the export
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    boundary = Column(Geometry('POLYGON', srid=4326))  # Spatial filter
    
    # Export configuration
    export_format = Column(String(20), default='json')
    granularity = Column(String(20), default='hourly')  # hourly, daily, weekly
    include_traffic_metrics = Column(Boolean, default=True)
    include_choke_points = Column(Boolean, default=True)
    include_incidents = Column(Boolean, default=True)
    include_metadata = Column(Boolean, default=True)
    
    # Data filtering options
    min_congestion_level = Column(String(20))  # Only include data above this level
    road_types_filter = Column(JSON)  # Array of road types to include
    time_of_day_filter = Column(JSON)  # Time ranges to include
    
    # Job status and progress
    status = Column(String(20), default='queued')  # queued, processing, completed, failed, expired
    progress_percentage = Column(Integer, default=0)
    progress_message = Column(String(500))
    
    # File information
    file_path = Column(String(500))
    file_name = Column(String(200))
    file_size_bytes = Column(Integer)
    compressed_size_bytes = Column(Integer)  # If compression is used
    download_url = Column(String(500))
    download_count = Column(Integer, default=0)
    expires_at = Column(DateTime)  # Auto-cleanup old exports
    
    # Processing metrics
    total_records_exported = Column(Integer, default=0)
    processing_time_seconds = Column(Float)
    compression_ratio = Column(Float)  # compressed_size / original_size
    
    # Timing data
    requested_at = Column(DateTime, default=datetime.utcnow)
    started_processing_at = Column(DateTime)
    completed_at = Column(DateTime)
    last_accessed_at = Column(DateTime)
    
    # Error tracking
    error_message = Column(Text)
    error_details = Column(JSON)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=2)
    
    # User tracking (for future authentication system)
    user_id = Column(String(100))
    user_email = Column(String(200))
    user_ip = Column(String(45))  # IPv6 support
    
    # Quality and validation
    data_quality_score = Column(Float)  # Overall quality of exported data (0-1)
    validation_passed = Column(Boolean, default=True)
    validation_errors = Column(JSON)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Indexes for export management
    __table_args__ = (
        Index('idx_export_status', 'status', 'requested_at'),
        Index('idx_export_cleanup', 'expires_at', 'status'),
        Index('idx_export_user', 'user_id', 'requested_at'),
        Index('idx_export_processing', 'status', 'progress_percentage'),
        Index('idx_export_spatial', 'boundary'),
        Index('idx_export_temporal', 'start_date', 'end_date'),
    )