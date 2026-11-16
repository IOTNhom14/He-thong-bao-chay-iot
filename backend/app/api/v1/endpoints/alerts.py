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

@router.post("/test-camera", summary="Kiểm tra kết nối và gửi thử ảnh chụp từ Camera IP/Điện thoại")
def test_camera_alert(
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN", "OPERATOR"]))
):
    from app.services.notification import capture_camera_snapshot, send_alert_notification
    from app.core.config import settings

    snapshot = capture_camera_snapshot(settings.CAMERA_SNAPSHOT_URL)
    if not snapshot:
        raise HTTPException(
            status_code=502,
            detail=f"Không thể kết nối hoặc lấy ảnh từ camera ({settings.CAMERA_SNAPSHOT_URL}). Hãy kiểm tra xem app IP Webcam trên điện thoại còn đang bật không."
        )

    test_msg = (
        "<b>[HỆ THỐNG BÁO CHÁY IOT] THỬ NGHIỆM TÍCH HỢP CAMERA</b>\n"
        f"- Nguồn Camera: <code>{settings.CAMERA_SNAPSHOT_URL}</code>\n"
        f"- Dung lượng ảnh: <b>{len(snapshot):,} bytes</b>\n"
        f"- Người thực hiện: <b>{current_user.get('email', 'Admin')}</b>\n"
        f"- Thời gian: <code>{datetime.now().strftime('%H:%M:%S %d/%m/%Y')}</code>\n"
        "<i>Hệ thống giám sát hình ảnh thời gian thực đã hoạt động bình thường!</i>"
    )

    send_alert_notification(test_msg, camera_url=settings.CAMERA_SNAPSHOT_URL, attach_photo=True)
    write_audit_log(current_user["id"], "TEST_CAMERA_SNAPSHOT", request)

    return {
        "status": "success",
        "camera_url": settings.CAMERA_SNAPSHOT_URL,
        "image_size_bytes": len(snapshot),
        "message": "Đã chụp ảnh thành công từ điện thoại và gửi tới Telegram!"
    }

