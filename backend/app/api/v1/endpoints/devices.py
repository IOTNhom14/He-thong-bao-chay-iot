import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.database import supabase
from app.core.security import get_current_user, require_roles, write_audit_log
from app.schemas.device import (
    DeviceCreateRequest,
    DeviceStatusUpdateRequest,
    ThresholdUpdateRequest
)

router = APIRouter(prefix="/devices", tags=["Quản lý Vòng Đời Thiết Bị"])

@router.get("", summary="Lấy danh sách tất cả thiết bị trong hệ thống")
def list_devices(current_user: dict = Depends(get_current_user)):
    """Mọi vai trò (Admin, Operator, Viewer) đều có thể xem danh sách"""
    res = supabase.table("devices").select("*").order("created_at", desc=True).execute()
    return res.data

@router.post("", status_code=201, summary="Onboarding đăng ký thiết bị mới (Chỉ ADMIN)")
def register_device(
    payload: DeviceCreateRequest,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN"]))
):
    auth_token = f"secret_tok_{secrets.token_hex(12)}"
    try:
        res = supabase.table("devices").insert({
            "device_id": payload.device_id,
            "name": payload.name,
            "location": payload.location,
            "auth_token": auth_token,
            "status": "REGISTERED",
            "assigned_user_id": payload.assigned_user_id
        }).execute()

        write_audit_log(current_user["id"], f"ONBOARD_DEVICE:{payload.device_id}", request)
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không thể khởi tạo thiết bị: {str(e)}")

@router.put("/{device_id}/status", summary="Cập nhật trạng thái vòng đời / Thu hồi thiết bị (Chỉ ADMIN)")
def change_device_lifecycle_status(
    device_id: str,
    payload: DeviceStatusUpdateRequest,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN"]))
):
    res = supabase.table("devices").update({
        "status": payload.status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).eq("device_id", device_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy thiết bị")

    write_audit_log(current_user["id"], f"CHANGE_STATUS:{device_id}->{payload.status}", request)
    return {
        "message": f"Đã chuyển trạng thái thiết bị sang {payload.status}",
        "device": res.data[0]
    }

@router.put("/{device_id}/thresholds", summary="Cập nhật ngưỡng khói và nhiệt độ từ xa (ADMIN & OPERATOR)")
def update_device_thresholds(
    device_id: str,
    payload: ThresholdUpdateRequest,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN", "OPERATOR"]))
):
    res = supabase.table("devices").update({
        "smoke_threshold": payload.smoke_threshold,
        "temp_threshold": payload.temp_threshold,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).eq("device_id", device_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy thiết bị")

    write_audit_log(current_user["id"], f"UPDATE_THRESHOLDS:{device_id}", request)
    return res.data[0]
