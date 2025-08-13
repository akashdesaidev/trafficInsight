"""
Performance optimization service for backend operations.
Includes database query optimization, connection pooling, and caching strategies.
"""

import asyncio
import time
from typing import Any, Dict, List, Optional, Callable
from functools import wraps
from contextlib import asynccontextmanager
import logging

from sqlalchemy import text, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import QueuePool

from app.core.config import get_settings

# Get settings instance
settings = get_settings()
from app.services.cache import cache_service

logger = logging.getLogger(__name__)


class PerformanceMonitor:
    """Monitor and log performance metrics."""
    
    def __init__(self):
        self.query_times: List[float] = []
        self.cache_hits = 0
        self.cache_misses = 0
        
    def log_query_time(self, duration: float, query: str):
        """Log database query execution time."""
        self.query_times.append(duration)
        if duration > 1.0:  # Log slow queries (> 1 second)
            logger.warning(f"Slow query ({duration:.2f}s): {query[:100]}...")
    
    def log_cache_hit(self):
        """Log cache hit."""
        self.cache_hits += 1
    
    def log_cache_miss(self):
        """Log cache miss."""
        self.cache_misses += 1
    
    def get_stats(self) -> Dict[str, Any]:
        """Get performance statistics."""
        avg_query_time = sum(self.query_times) / len(self.query_times) if self.query_times else 0
        cache_hit_rate = self.cache_hits / (self.cache_hits + self.cache_misses) if (self.cache_hits + self.cache_misses) > 0 else 0
        
        return {
            "avg_query_time_ms": avg_query_time * 1000,
            "total_queries": len(self.query_times),
            "slow_queries": len([t for t in self.query_times if t > 1.0]),
            "cache_hit_rate": cache_hit_rate,
            "cache_hits": self.cache_hits,
            "cache_misses": self.cache_misses
        }


# Global performance monitor
perf_monitor = PerformanceMonitor()


def performance_timer(func_name: str = None):
    """Decorator to measure function execution time."""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            name = func_name or f"{func.__module__}.{func.__name__}"
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                return result
            finally:
                duration = time.time() - start_time
                logger.debug(f"Function {name} took {duration:.3f}s")
                
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            name = func_name or f"{func.__module__}.{func.__name__}"
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                return result
            finally:
                duration = time.time() - start_time
                logger.debug(f"Function {name} took {duration:.3f}s")
        
        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    return decorator


def cached_query(cache_key: str, ttl: int = 300):
    """Decorator to cache database query results."""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Try to get from cache first
            cached_result = await cache_service.get(cache_key)
            if cached_result is not None:
                perf_monitor.log_cache_hit()
                return cached_result
            
            # Execute function and cache result
            perf_monitor.log_cache_miss()
            result = await func(*args, **kwargs)
            await cache_service.set(cache_key, result, ttl)
            return result
            
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # Try to get from cache first (sync version)
            cached_result = cache_service.get_sync(cache_key)
            if cached_result is not None:
                perf_monitor.log_cache_hit()
                return cached_result
            
            # Execute function and cache result
            perf_monitor.log_cache_miss()
            result = func(*args, **kwargs)
            cache_service.set_sync(cache_key, result, ttl)
            return result
        
        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    return decorator


# Database query optimization utilities
class QueryOptimizer:
    """Database query optimization utilities."""
    
    @staticmethod
    def optimize_traffic_metrics_query(
        db: Session,
        start_date,
        end_date,
        bbox: Optional[Dict[str, float]] = None,
        limit: int = 1000
    ):
        """Optimized query for traffic metrics with proper indexing."""
        base_query = """
        SELECT tm.id, tm.timestamp, tm.latitude, tm.longitude,
               tm.congestion_level, tm.average_speed, tm.free_flow_speed,
               tm.travel_time_ratio, tm.road_segment_id
        FROM traffic_metrics tm
        WHERE tm.timestamp >= :start_date 
        AND tm.timestamp <= :end_date
        """
        
        params = {
            "start_date": start_date,
            "end_date": end_date
        }
        
        # Add spatial filtering if bbox provided
        if bbox:
            base_query += """
            AND tm.latitude >= :min_lat
            AND tm.latitude <= :max_lat  
            AND tm.longitude >= :min_lon
            AND tm.longitude <= :max_lon
            """
            params.update({
                "min_lat": bbox["min_lat"],
                "max_lat": bbox["max_lat"],
                "min_lon": bbox["min_lon"],
                "max_lon": bbox["max_lon"]
            })
        
        base_query += """
        ORDER BY tm.timestamp DESC
        LIMIT :limit
        """
        params["limit"] = limit
        
        return db.execute(text(base_query), params).fetchall()
    
    @staticmethod
    def get_aggregated_traffic_data(
        db: Session,
        start_date,
        end_date,
        granularity: str = "hourly"
    ):
        """Get aggregated traffic data for better performance."""
        if granularity == "hourly":
            time_format = "YYYY-MM-DD HH24:00:00"
            interval = "1 hour"
        else:  # daily
            time_format = "YYYY-MM-DD 00:00:00"
            interval = "1 day"
        
        query = f"""
        SELECT 
            date_trunc('hour', timestamp) as time_bucket,
            COUNT(*) as record_count,
            AVG(congestion_level) as avg_congestion,
            AVG(average_speed) as avg_speed,
            MIN(average_speed) as min_speed,
            MAX(average_speed) as max_speed,
            AVG(travel_time_ratio) as avg_travel_time_ratio
        FROM traffic_metrics
        WHERE timestamp >= :start_date 
        AND timestamp <= :end_date
        GROUP BY date_trunc('hour', timestamp)
        ORDER BY time_bucket
        """
        
        return db.execute(text(query), {
            "start_date": start_date,
            "end_date": end_date
        }).fetchall()


# Connection pool configuration
def configure_connection_pool(engine: Engine):
    """Configure optimized connection pool settings."""
    engine.pool._creator = engine.pool._creator
    engine.pool.size = 10  # Pool size
    engine.pool.max_overflow = 20  # Max overflow connections
    engine.pool.timeout = 30  # Connection timeout
    engine.pool.recycle = 3600  # Recycle connections after 1 hour


# Query monitoring
@event.listens_for(Engine, "before_cursor_execute")
def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Log query start time."""
    context._query_start_time = time.time()


@event.listens_for(Engine, "after_cursor_execute")
def receive_after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Log query execution time."""
    if hasattr(context, '_query_start_time'):
        total = time.time() - context._query_start_time
        perf_monitor.log_query_time(total, statement)


class BatchProcessor:
    """Process large datasets in batches to avoid memory issues."""
    
    def __init__(self, batch_size: int = 1000):
        self.batch_size = batch_size
    
    async def process_in_batches(
        self,
        data: List[Any],
        processor: Callable,
        **kwargs
    ) -> List[Any]:
        """Process data in batches asynchronously."""
        results = []
        
        for i in range(0, len(data), self.batch_size):
            batch = data[i:i + self.batch_size]
            batch_result = await processor(batch, **kwargs)
            results.extend(batch_result if isinstance(batch_result, list) else [batch_result])
            
            # Allow other tasks to run
            await asyncio.sleep(0)
        
        return results
    
    def process_in_batches_sync(
        self,
        data: List[Any],
        processor: Callable,
        **kwargs
    ) -> List[Any]:
        """Process data in batches synchronously."""
        results = []
        
        for i in range(0, len(data), self.batch_size):
            batch = data[i:i + self.batch_size]
            batch_result = processor(batch, **kwargs)
            results.extend(batch_result if isinstance(batch_result, list) else [batch_result])
        
        return results


# Response compression middleware
class CompressionMiddleware:
    """Middleware for response compression."""
    
    def __init__(self, min_size: int = 1024):
        self.min_size = min_size
    
    def should_compress(self, content_type: str, content_length: int) -> bool:
        """Determine if response should be compressed."""
        if content_length < self.min_size:
            return False
        
        compressible_types = [
            'application/json',
            'text/plain',
            'text/html',
            'text/css',
            'application/javascript'
        ]
        
        return any(ct in content_type for ct in compressible_types)


# Memory usage monitoring
class MemoryMonitor:
    """Monitor memory usage."""
    
    @staticmethod
    def get_memory_usage():
        """Get current memory usage in MB."""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        memory_info = process.memory_info()
        
        return {
            "rss_mb": memory_info.rss / 1024 / 1024,  # Resident Set Size
            "vms_mb": memory_info.vms / 1024 / 1024,  # Virtual Memory Size
            "percent": process.memory_percent()
        }
    
    @staticmethod
    def log_memory_usage(operation: str = ""):
        """Log current memory usage."""
        usage = MemoryMonitor.get_memory_usage()
        logger.info(f"Memory usage {operation}: RSS={usage['rss_mb']:.1f}MB, "
                   f"VMS={usage['vms_mb']:.1f}MB, %={usage['percent']:.1f}")


# Global instances
batch_processor = BatchProcessor()
memory_monitor = MemoryMonitor()
query_optimizer = QueryOptimizer()