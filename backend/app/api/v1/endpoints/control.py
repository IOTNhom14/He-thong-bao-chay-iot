from fastapi import APIRouter, Depends, HTTPException, Request
import time
from uuid import UUID

from app.core.database import supabase
from app.core.security import get_current_user, require_device_access, write_audit_log
from app.schemas.control import ControlCommandRequest
from app.mqtt.worker import mqtt_worker

router = APIRouter(prefix="/devices", tags=["Điều Khiển Cơ Cấu Chấp Hành"])

@router.get("/{device_id}/commands", summary="Lấy trạng thái các lệnh điều khiển gần nhất")
def list_device_commands(
    device_id: str,
    device: dict = Depends(require_device_access(["ADMIN", "OPERATOR", "VIEWER"])),
    current_user: dict = Depends(get_current_user),
):
    res = (
        supabase.table("command_logs")
        .select("*")
        .eq("device_id", device_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return [
        {
            **command,
            "command_id": f"cmd_{command['id']}",
            "params": command.get("parameters") or {},
        }
        for command in res.data
    ]

@router.post("/{device_id}/control", status_code=202, summary="Gửi lệnh điều khiển xuống ESP32 (Chỉ ADMIN & OPERATOR sở hữu thiết bị)")
def send_control_command(
    device_id: str,
    payload: ControlCommandRequest,
    request: Request,
    device: dict = Depends(require_device_access(["ADMIN", "OPERATOR"])),
    current_user: dict = Depends(get_current_user),
):
    """
    Gửi lệnh điều khiển cơ cấu chấp hành (MUTE_BUZZER, TEST_ALARM, UPDATE_THRESHOLD).
    Chặn BOLA: OPERATOR chỉ được điều khiển thiết bị được phân công.
    """
    dev_status = device.get("status")
    if dev_status == "DECOMMISSIONED":
        raise HTTPException(status_code=400, detail="Thiết bị đã bị thu hồi, không thể nhận lệnh điều khiển")

    # 2. Ghi nhận lệnh vào bảng command_logs với trạng thái ban đầu là SENT
    command_record = {
        "device_id": device_id,
        "action": payload.action,
        "parameters": payload.params,
        "status": "SENT",
    }
    user_id = current_user.get("id")
    if user_id:
        try:
            UUID(str(user_id))
            command_record["initiated_by"] = str(user_id)
        except ValueError:
            pass

    command_id_str = f"cmd_{int(time.time() * 1000) % 100000}"
    try:
        log_res = supabase.table("command_logs").insert(command_record).execute()
        if log_res.data:
            cmd_record = log_res.data[0]
            command_id_str = f"cmd_{cmd_record['id']}"
    except Exception as exc:
        print(f"[CONTROL DB ERROR] Ghi nhận command log thất bại: {exc}")

    # 3. Đóng gói payload chuẩn hợp đồng và phát qua MQTT
    mqtt_payload = {
        "command_id": command_id_str,
        "action": payload.action,
        "params": payload.params
    }
    try:
        mqtt_worker.publish_command(device_id, mqtt_payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    # 4. Ghi Audit Log lưu vết
    write_audit_log(current_user["id"], f"SEND_COMMAND:{payload.action}->To:{device_id}", request)

    return {
        "message": "Đã gửi lệnh điều khiển xuống thiết bị thành công",
        "command_id": command_id_str,
        "status": "SENT"
    }
