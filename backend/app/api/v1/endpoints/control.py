from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.database import supabase
from app.core.security import require_roles, write_audit_log
from app.schemas.control import ControlCommandRequest
from app.mqtt.worker import mqtt_worker

router = APIRouter(prefix="/devices", tags=["Điều Khiển Cơ Cấu Chấp Hành"])

@router.post("/{device_id}/control", status_code=202, summary="Gửi lệnh điều khiển xuống ESP32 (Chỉ ADMIN & OPERATOR)")
def send_control_command(
    device_id: str,
    payload: ControlCommandRequest,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN", "OPERATOR"]))
):
    """
    Gửi lệnh điều khiển cơ cấu chấp hành (MUTE_BUZZER, TEST_ALARM, UPDATE_THRESHOLD).
    Viewer bị chặn tự động bởi require_roles và trả về 403 Forbidden.
    """
    # 1. Kiểm tra trạng thái thiết bị trong CSDL
    dev_res = supabase.table("devices").select("status").eq("device_id", device_id).execute()
    if not dev_res.data:
        raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
    if dev_res.data[0].get("status") == "DECOMMISSIONED":
        raise HTTPException(status_code=400, detail="Thiết bị đã bị thu hồi, không thể nhận lệnh điều khiển")

    # 2. Ghi nhận lệnh vào bảng command_logs với trạng thái ban đầu là SENT
    log_res = supabase.table("command_logs").insert({
        "device_id": device_id,
        "action": payload.action,
        "parameters": payload.params,
        "status": "SENT",
        "initiated_by": current_user["id"]
    }).execute()

    cmd_record = log_res.data[0]
    command_id_str = f"cmd_{cmd_record['id']}"

    # 3. Đóng gói payload chuẩn hợp đồng và phát qua MQTT
    mqtt_payload = {
        "command_id": command_id_str,
        "action": payload.action,
        "params": payload.params
    }
    mqtt_worker.publish_command(device_id, mqtt_payload)

    # 4. Ghi Audit Log lưu vết
    write_audit_log(current_user["id"], f"SEND_COMMAND:{payload.action}->To:{device_id}", request)

    return {
        "message": "Đã gửi lệnh điều khiển xuống thiết bị thành công",
        "command_id": command_id_str,
        "status": "SENT"
    }
