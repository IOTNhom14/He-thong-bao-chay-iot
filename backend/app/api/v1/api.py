from fastapi import APIRouter

from app.api.v1.endpoints import health, devices, control, alerts, telemetry

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(devices.router)
api_router.include_router(control.router)
api_router.include_router(alerts.router)
api_router.include_router(telemetry.router)
