"""
Export API endpoints for JSON data export functionality.
"""

from datetime import datetime
from typing import Optional, Dict, Any
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, validator

from app.services.export_service import export_service, ExportStatus


router = APIRouter()


class ExportRequest(BaseModel):
    """Request model for creating an export job."""
    start_date: datetime
    end_date: datetime
    export_type: str = "traffic_data"
    granularity: str = "hourly"
    bbox: Optional[Dict[str, float]] = None
    
    @validator("export_type")
    def validate_export_type(cls, v):
        allowed_types = ["traffic_data", "chokepoints", "comprehensive"]
        if v not in allowed_types:
            raise ValueError(f"export_type must be one of {allowed_types}")
        return v
    
    @validator("granularity")
    def validate_granularity(cls, v):
        allowed_granularity = ["hourly", "daily"]
        if v not in allowed_granularity:
            raise ValueError(f"granularity must be one of {allowed_granularity}")
        return v
    
    @validator("bbox")
    def validate_bbox(cls, v):
        if v is not None:
            required_keys = ["min_lat", "max_lat", "min_lon", "max_lon"]
            if not all(key in v for key in required_keys):
                raise ValueError(f"bbox must contain keys: {required_keys}")
            
            # Validate coordinate ranges
            if not (-90 <= v["min_lat"] <= v["max_lat"] <= 90):
                raise ValueError("Invalid latitude range in bbox")
            if not (-180 <= v["min_lon"] <= v["max_lon"] <= 180):
                raise ValueError("Invalid longitude range in bbox")
        return v
    
    @validator("end_date")
    def validate_date_range(cls, v, values):
        if "start_date" in values and v <= values["start_date"]:
            raise ValueError("end_date must be after start_date")
        return v


class ExportResponse(BaseModel):
    """Response model for export job creation."""
    job_id: str
    message: str
    estimated_completion_time: str


class ExportStatusResponse(BaseModel):
    """Response model for export job status."""
    job_id: str
    status: str
    progress: int
    message: str
    download_url: Optional[str] = None
    file_size: Optional[int] = None


@router.post("/export-json", response_model=ExportResponse)
async def create_export_job(request: ExportRequest) -> ExportResponse:
    """
    Create a new JSON export job.
    
    This endpoint creates an asynchronous job to export traffic data
    in JSON format. The job runs in the background and can be monitored
    using the job status endpoint.
    
    Args:
        request: Export configuration including date range, type, and area
    
    Returns:
        Export job information including job ID for tracking
    """
    try:
        # Validate date range (max 90 days)
        date_diff = (request.end_date - request.start_date).days
        if date_diff > 90:
            raise HTTPException(
                status_code=400,
                detail="Date range cannot exceed 90 days"
            )
        
        # Create export job
        job_id = export_service.create_export_job(
            start_date=request.start_date,
            end_date=request.end_date,
            bbox=request.bbox,
            export_type=request.export_type,
            granularity=request.granularity
        )
        
        # Estimate completion time based on date range
        estimated_minutes = max(2, date_diff // 7)  # Rough estimate
        
        return ExportResponse(
            job_id=job_id,
            message="Export job created successfully",
            estimated_completion_time=f"{estimated_minutes} minutes"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create export job: {str(e)}"
        )


@router.get("/export-status/{job_id}", response_model=ExportStatusResponse)
async def get_export_status(job_id: str) -> ExportStatusResponse:
    """
    Get the status of an export job.
    
    Args:
        job_id: Unique identifier of the export job
    
    Returns:
        Current status, progress, and download information if completed
    """
    try:
        status_info = export_service.get_job_status(job_id)
        return ExportStatusResponse(**status_info)
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get job status: {str(e)}"
        )


@router.get("/download/{job_id}")
async def download_export(job_id: str):
    """
    Download the exported JSON file.
    
    Args:
        job_id: Unique identifier of the completed export job
    
    Returns:
        JSON file as download
    """
    try:
        # Check job status first
        status_info = export_service.get_job_status(job_id)
        
        if status_info["status"] != ExportStatus.COMPLETED:
            raise HTTPException(
                status_code=400,
                detail=f"Export job is not completed. Status: {status_info['status']}"
            )
        
        # Get file path
        file_path = export_service.get_export_file_path(job_id)
        
        if not file_path or not file_path.exists():
            raise HTTPException(
                status_code=404,
                detail="Export file not found"
            )
        
        # Return file download
        return FileResponse(
            path=str(file_path),
            filename=f"traffic_export_{job_id}.json",
            media_type="application/json"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download export: {str(e)}"
        )


@router.delete("/export/{job_id}")
async def delete_export(job_id: str):
    """
    Delete an export job and its associated file.
    
    Args:
        job_id: Unique identifier of the export job to delete
    
    Returns:
        Deletion confirmation
    """
    try:
        file_path = export_service.get_export_file_path(job_id)
        
        if file_path and file_path.exists():
            file_path.unlink()
            return {"message": f"Export {job_id} deleted successfully"}
        else:
            raise HTTPException(
                status_code=404,
                detail="Export file not found"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete export: {str(e)}"
        )


@router.post("/cleanup")
async def cleanup_old_exports(days: int = 7):
    """
    Clean up export files older than specified days.
    
    Args:
        days: Number of days to keep export files (default: 7)
    
    Returns:
        Cleanup confirmation
    """
    try:
        if days < 1:
            raise HTTPException(
                status_code=400,
                detail="Days must be at least 1"
            )
        
        export_service.cleanup_old_exports(days=days)
        
        return {
            "message": f"Cleaned up exports older than {days} days"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to cleanup exports: {str(e)}"
        )