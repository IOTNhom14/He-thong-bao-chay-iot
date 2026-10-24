from fastapi import APIRouter

router = APIRouter()

@router.get("/health", summary="Kiểm tra trạng thái hoạt động của hệ thống")
def health_check():
    return {
        "status": "healthy",
        "service": "fire-alarm-backend",
        "version": "1.0.0"
    }
