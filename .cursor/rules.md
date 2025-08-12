# Cursor Rules for Traffic Insight Project

## General

- Always check `docs/PRD.md` for requirements before coding.
- Follow `execution_plan.md` in `.cursor/` for task order.
- Use TypeScript in Next.js frontend, Python 3.11+ in FastAPI backend.
- Use shadcn/ui for UI components.
- Use REST JSON APIs.

## Frontend

- Store all map logic in `/components/map/`.
- Use Recharts for graphs.
- Use Axios for API calls.
- Place shared UI in `/components/ui/`.

## Backend

- All API routes in `/api/`.
- Use Pydantic models for validation.
- Keep TomTom API integrations in `/app/services/tomtom.py`.

## Data Handling

- Cache repetitive API calls where possible.
- Return downloadable JSON with correct headers for export feature.

## Communication with Cursor

- If unclear, ask for clarification before generating code.
- always update checklist when anny task is complete
