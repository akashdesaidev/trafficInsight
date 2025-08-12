# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Traffic Insight Dashboard is a comprehensive web application that combines real-time traffic visualization with historical analytics. It provides traffic analysts, urban planners, and logistics companies with actionable insights into traffic patterns and congestion hotspots using TomTom Traffic APIs.

## Development Commands

### Backend (FastAPI)
```bash
# Start backend development server
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Alternative: run directly with python
cd backend
python app/main.py
```

### Frontend (Next.js)
```bash
# Start frontend development server
cd frontend
npm run dev          # Development server on localhost:3000
npm run build        # Production build
npm run start        # Production server
npm run lint         # ESLint
```

### Infrastructure
```bash
# Start PostgreSQL and Redis services
cd docker
docker-compose up -d

# Stop services
docker-compose down
```

## Architecture Overview

### Backend Architecture (FastAPI)
- **Framework**: FastAPI with Python 3.11+
- **Database**: PostgreSQL 15+ with PostGIS extension for spatial data
- **Caching**: Redis for API response caching
- **Task Queue**: Celery (planned) for background job processing
- **Configuration**: Pydantic Settings with environment variable support

**Key Backend Modules**:
- `app/api/` - API endpoints (health, traffic)
- `app/core/config.py` - Application settings and TomTom API keys
- `app/models/` - Pydantic models for request/response validation
- `app/services/` - Business logic (cache, TomTom integration)
- `app/db/` - Database session management

### Frontend Architecture (Next.js 14+)
- **Framework**: Next.js 14+ with App Router
- **UI Components**: shadcn/ui component library
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand for lightweight state management
- **Charts**: Recharts for interactive visualizations
- **Maps**: TomTom Web SDK for interactive mapping
- **HTTP Client**: Native Fetch API

**Key Frontend Modules**:
- `components/map/` - Map-related React components
- `store/mapStore.ts` - Zustand store for map state (center, zoom, location)
- `types/tomtom.ts` - TypeScript definitions for TomTom API responses
- `lib/utils.ts` - Utility functions

### API Integration
The application integrates with multiple TomTom APIs:
- **Traffic Flow API**: Real-time traffic data via raster tiles
- **Traffic Incidents API**: Traffic incident information
- **Traffic Stats API**: Historical traffic analytics (planned)
- **Search API**: Location geocoding

## Database Configuration

**PostgreSQL with PostGIS**:
- Database: `traffic_insight`
- User/Password: `traffic/traffic`
- Port: 5432
- Extensions: PostGIS for spatial data handling

**Redis Cache**:
- Port: 6379
- Used for API response caching with TTL

## Environment Configuration

Backend configuration is managed through `app/core/config.py` with support for `.env` files:

```python
# Key settings
database_url: str = "postgresql+psycopg2://traffic:traffic@localhost:5432/traffic_insight"
redis_url: str = "redis://localhost:6379/0"
api_v1_prefix: str = "/api"

# TomTom API Keys (move to .env in production)
tomtom_maps_api_key: str
tomtom_traffic_api_key: str
tomtom_search_api_key: str
tomtom_stats_api_key: str
```

## API Endpoints Structure

**Current Endpoints**:
- `GET /api/health` - Health check endpoint
- `GET /api/traffic/live-traffic` - Returns tile URL template for real-time traffic
- `GET /api/traffic/traffic-incidents` - Traffic incident data with bbox filtering
- `GET /api/traffic/tiles/{z}/{x}/{y}.png` - Proxied traffic flow tiles from TomTom

**Planned Endpoints** (from PRD):
- `GET /api/historical-traffic` - Historical traffic analytics
- `GET /api/top-chokepoints` - Ranked congestion hotspots
- `GET /api/chokepoint-details` - Detailed choke point analysis
- `POST /api/export-json` - Export historical data in JSON format

## Map Configuration

Default map center is set to Bangalore, India coordinates in `frontend/store/mapStore.ts`:
```typescript
center: [77.5946, 12.9716],  // [longitude, latitude]
zoom: 10
```

## Development Notes

### TomTom API Integration
- Traffic flow tiles use `relative-dark` style by default
- Thickness parameter ranges from 1-20 (default: 10)
- API responses are cached in Redis with 120-second TTL for incidents
- Traffic tiles are proxied through backend to avoid client-side API key exposure

### CORS Configuration
Backend allows all origins (`*`) for development. Restrict in production.

### Error Handling
- Graceful fallbacks for missing API keys (returns empty responses)
- HTTP 403 handling for insufficient API entitlements
- Proper error status code propagation from external APIs

### State Management
Frontend uses Zustand for simple state management. Current state includes:
- Map center coordinates
- Zoom level  
- Selected location (for search/navigation)

## Testing and Quality

Current setup includes:
- ESLint configuration for frontend code quality
- FastAPI automatic OpenAPI/Swagger documentation
- No test framework currently configured (consider pytest for backend, Jest for frontend)

When adding tests, check for existing test commands or ask user for preferred testing approach.