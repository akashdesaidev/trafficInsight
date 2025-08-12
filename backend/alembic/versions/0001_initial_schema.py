"""Initial schema with PostGIS support

Revision ID: 0001
Revises: 
Create Date: 2024-12-26 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import geoalchemy2
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable PostGIS extension
    op.execute('CREATE EXTENSION IF NOT EXISTS postgis')
    
    # Create traffic_metrics table
    op.create_table(
        'traffic_metrics',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('location', geoalchemy2.Geometry('POINT', srid=4326), nullable=False),
        sa.Column('road_name', sa.String(255)),
        sa.Column('segment_id', sa.String(100)),
        sa.Column('timestamp', sa.DateTime, nullable=False),
        sa.Column('date', sa.String(10), nullable=False),
        sa.Column('hour', sa.Integer, nullable=False),
        sa.Column('day_of_week', sa.Integer, nullable=False),
        sa.Column('speed_kmh', sa.Float),
        sa.Column('free_flow_speed_kmh', sa.Float),
        sa.Column('current_travel_time_minutes', sa.Float),
        sa.Column('free_flow_travel_time_minutes', sa.Float),
        sa.Column('confidence_level', sa.Float),
        sa.Column('congestion_level', sa.Integer, nullable=False),
        sa.Column('delay_minutes', sa.Float),
        sa.Column('relative_speed', sa.Float),
        sa.Column('data_source', sa.String(50), default='tomtom'),
        sa.Column('raw_data', postgresql.JSON)
    )
    
    # Create indexes for traffic_metrics
    op.create_index('idx_traffic_location_time', 'traffic_metrics', ['location', 'timestamp'])
    op.create_index('idx_traffic_date_hour', 'traffic_metrics', ['date', 'hour'])
    op.create_index('idx_traffic_congestion', 'traffic_metrics', ['congestion_level', 'timestamp'])
    op.create_index('idx_traffic_road_date', 'traffic_metrics', ['road_name', 'date'])
    op.create_index('idx_traffic_segment_date', 'traffic_metrics', ['segment_id', 'date'])
    op.create_index('idx_traffic_road_name', 'traffic_metrics', ['road_name'])
    op.create_index('idx_traffic_segment_id', 'traffic_metrics', ['segment_id'])
    op.create_index('idx_traffic_timestamp', 'traffic_metrics', ['timestamp'])
    
    # Create choke_points table
    op.create_table(
        'choke_points',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('location', geoalchemy2.Geometry('POINT', srid=4326), nullable=False),
        sa.Column('road_name', sa.String(255), nullable=False),
        sa.Column('segment_id', sa.String(100)),
        sa.Column('congestion_score', sa.Float, nullable=False),
        sa.Column('rank', sa.Integer),
        sa.Column('avg_delay_minutes', sa.Float),
        sa.Column('max_delay_minutes', sa.Float),
        sa.Column('frequency_score', sa.Float),
        sa.Column('intensity_score', sa.Float),
        sa.Column('duration_score', sa.Float),
        sa.Column('peak_periods', postgresql.JSON),
        sa.Column('worst_hour', sa.Integer),
        sa.Column('worst_day', sa.Integer),
        sa.Column('last_updated', sa.DateTime),
        sa.Column('analysis_date_range', sa.String(50)),
        sa.Column('total_observations', sa.Integer),
        sa.Column('data_quality_score', sa.Float)
    )
    
    # Create indexes for choke_points
    op.create_index('idx_chokepoint_score', 'choke_points', ['congestion_score'])
    op.create_index('idx_chokepoint_rank', 'choke_points', ['rank'])
    op.create_index('idx_chokepoint_location', 'choke_points', ['location'])
    op.create_index('idx_chokepoint_segment_id', 'choke_points', ['segment_id'])
    
    # Create data_collection_jobs table
    op.create_table(
        'data_collection_jobs',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('job_type', sa.String(50), nullable=False),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('start_time', sa.DateTime),
        sa.Column('end_time', sa.DateTime),
        sa.Column('duration_seconds', sa.Integer),
        sa.Column('data_date_start', sa.String(10)),
        sa.Column('data_date_end', sa.String(10)),
        sa.Column('records_processed', sa.Integer, default=0),
        sa.Column('records_inserted', sa.Integer, default=0),
        sa.Column('records_updated', sa.Integer, default=0),
        sa.Column('errors_count', sa.Integer, default=0),
        sa.Column('error_message', sa.String(1000)),
        sa.Column('error_details', postgresql.JSON),
        sa.Column('job_config', postgresql.JSON),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now())
    )
    
    # Create indexes for data_collection_jobs
    op.create_index('idx_job_type_status', 'data_collection_jobs', ['job_type', 'status'])
    op.create_index('idx_job_date_range', 'data_collection_jobs', ['data_date_start', 'data_date_end'])
    op.create_index('idx_job_created_at', 'data_collection_jobs', ['created_at'])


def downgrade() -> None:
    op.drop_table('data_collection_jobs')
    op.drop_table('choke_points')
    op.drop_table('traffic_metrics')
    op.execute('DROP EXTENSION IF EXISTS postgis')