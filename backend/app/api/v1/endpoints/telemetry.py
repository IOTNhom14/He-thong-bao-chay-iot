from fastapi import APIRouter, Depends

from app.core.database import supabase
from app.core.security import get_current_user

router = APIRouter(prefix="/devices", tags=["Dữ Liệu Đo Telemetry"])

@router.get("/{device_id}/telemetry", summary="Lấy lịch sử dữ liệu cảm biến phục vụ vẽ biểu đồ")
def get_device_telemetry_history(
    device_id: str,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """
    Truy vấn dữ liệu telemetry gần nhất của một thiết bị.
    Đảo ngược thứ tự thời gian tăng dần để frontend hiển thị đồ thị từ trái sang phải.
    """
    res = (
        supabase.table("telemetry")
        .select("*")
        .eq("device_id", device_id)
        .order("timestamp", desc=True)
        .limit(limit)
        .execute()
    )
    return list(reversed(res.data))
