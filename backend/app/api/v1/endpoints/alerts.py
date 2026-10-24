from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.database import supabase
from app.core.security import get_current_user, require_roles, write_audit_log

router = APIRouter(prefix="/alerts", tags=["Giám Sát & Xử Lý Cảnh Báo"])

@router.get("", summary="Xem danh sách lịch sử các vụ cảnh báo cháy")
def list_alerts(limit: int = 50, current_user: dict = Depends(get_current_user)):
    """Mọi vai trò (Admin, Operator, Viewer) đều có thể xem lịch sử cảnh báo"""
    res = (
        supabase.table("alerts")
        .select("*")
        .order("triggered_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data

@router.put("/{alert_id}/acknowledge", summary="Xác nhận đã xử lý sự cố cháy (Chỉ ADMIN & OPERATOR)")
def acknowledge_alert(
    alert_id: int,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN", "OPERATOR"]))
):
    now_iso = datetime.now(timezone.utc).isoformat()
    res = supabase.table("alerts").update({
        "status": "ACKNOWLEDGED",
        "acknowledged_by": current_user["id"],
        "resolved_at": now_iso
    }).eq("id", alert_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi cảnh báo")

    write_audit_log(current_user["id"], f"ACK_ALERT:{alert_id}", request)
    return res.data[0]
