import secrets
from datetime import datetime, timezone
from uuid import UUID
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.core.database import supabase
from app.core.security import get_current_user, get_current_user_query, require_roles, require_device_access, write_audit_log
from app.schemas.device import (
    DeviceCreateRequest,
    DeviceCameraUpdateRequest,
    DeviceProvisionRequest,
    DeviceStatusUpdateRequest,
    ThresholdUpdateRequest
)
from app.mqtt.worker import mqtt_worker

router = APIRouter(prefix="/devices", tags=["Quản lý Vòng Đời Thiết Bị"])

def _queue_device_command(
    device_id: str,
    action: str,
    params: dict,
    current_user: dict,
    log_device_id: str | None = None,
) -> str:
    command_record = {
        "device_id": log_device_id or device_id,
        "action": action,
        "parameters": params,
        "status": "SENT",
    }
    user_id = current_user.get("id")
    if user_id:
        try:
            UUID(str(user_id))
            command_record["initiated_by"] = str(user_id)
        except ValueError:
            pass

    log_res = supabase.table("command_logs").insert(command_record).execute()
    if not log_res.data:
        raise HTTPException(status_code=502, detail="Không thể tạo nhật ký lệnh điều khiển")

    command_id = f"cmd_{log_res.data[0]['id']}"
    try:
        mqtt_worker.publish_command(
            device_id,
            {"command_id": command_id, "action": action, "params": params},
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return command_id

@router.get("", summary="Lấy danh sách tất cả thiết bị trong hệ thống")
def list_devices(current_user: dict = Depends(get_current_user)):
    """Mọi vai trò đều có thể xem danh sách; OPERATOR chỉ nhận thiết bị được phân công."""
    user_id = current_user.get("id")
    user_role = current_user.get("role")
    devices = []
    try:
        query = supabase.table("devices").select("*").order("created_at", desc=True)
        if user_role == "OPERATOR":
            query = query.eq("assigned_user_id", str(user_id))

        res = query.execute()
        if res.data:
            for device in res.data:
                try:
                    latest_res = (
                        supabase.table("telemetry")
                        .select("gas_ppm, temperature, humidity, flame_detected, local_alarm, timestamp")
                        .eq("device_id", device["device_id"])
                        .order("timestamp", desc=True)
                        .limit(1)
                        .execute()
                    )
                    latest = latest_res.data[0] if latest_res.data else None
                except Exception:
                    latest = None

                if latest:
                    timestamp = latest.get("timestamp")
                    parsed_time = None
                    if timestamp:
                        if isinstance(timestamp, (int, float)):
                            parsed_time = int(timestamp)
                        elif isinstance(timestamp, str):
                            try:
                                parsed_time = int(datetime.fromisoformat(timestamp.replace("Z", "+00:00")).timestamp())
                            except Exception:
                                pass
                    device.update({
                        "latest_temp": latest.get("temperature"),
                        "latest_gas": latest.get("gas_ppm"),
                        "latest_humidity": latest.get("humidity"),
                        "latest_flame": latest.get("flame_detected", False),
                        "latest_local_alarm": latest.get("local_alarm", False),
                        "latest_alarm": bool(
                            latest.get("flame_detected", False)
                            or (latest.get("temperature") or 0) >= float(device.get("temp_threshold") or 55)
                            or (latest.get("gas_ppm") or 0) >= float(
                                device.get("smoke_threshold") or device.get("gas_threshold") or 400
                            )
                        ),
                        "latest_telemetry_time": parsed_time,
                    })
                devices.append(device)
    except Exception as exc:
        print(f"[DEVICES LIST ERROR] Supabase query failed: {exc}")

    return devices

@router.post("", status_code=201, summary="Onboarding đăng ký thiết bị mới (Chỉ ADMIN)")
def register_device(
    payload: DeviceCreateRequest,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN"]))
):
    auth_token = f"secret_tok_{secrets.token_hex(12)}"
    provision_attempted = False
    provision_sent = False
    assigned_user = payload.assigned_user_id or current_user.get("id")
    if assigned_user:
        try:
            UUID(str(assigned_user))
            assigned_user = str(assigned_user)
        except ValueError:
            assigned_user = current_user.get("id")

    try:
        res = supabase.table("devices").insert({
            "device_id": payload.device_id,
            "name": payload.name,
            "location": payload.location,
            "auth_token": auth_token,
            "status": "REGISTERED",
            "smoke_threshold": payload.smoke_threshold,
            "temp_threshold": payload.temp_threshold,
            "camera_url": getattr(payload, "camera_url", None),
            "assigned_user_id": assigned_user
        }).execute()

        provision_command_id = None
        if payload.provision_from_device_id:
            provision_attempted = True
            if payload.provision_from_device_id == payload.device_id:
                raise HTTPException(
                    status_code=400,
                    detail="Thiết bị nguồn phải khác device_id mới"
                )

            provision_command_id = _queue_device_command(
                payload.provision_from_device_id,
                "PROVISION_DEVICE",
                {
                    "new_device_id": payload.device_id,
                    "device_token": auth_token,
                },
                current_user,
                log_device_id=payload.device_id,
            )
            provision_sent = True

        write_audit_log(current_user["id"], f"ONBOARD_DEVICE:{payload.device_id}", request)
        return {
            **res.data[0],
            "provision_command_id": provision_command_id,
        }
    except HTTPException:
        if provision_attempted and not provision_sent:
            supabase.table("devices").delete().eq("device_id", payload.device_id).execute()
        raise
    except Exception as e:
        if provision_attempted and not provision_sent:
            supabase.table("devices").delete().eq("device_id", payload.device_id).execute()
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

    command_id = None
    lifecycle_commands = {
        "ACTIVE": {"action": "SET_LIFECYCLE", "params": {"state": "ACTIVE"}},
        "MAINTENANCE": {"action": "SET_LIFECYCLE", "params": {"state": "MAINTENANCE"}},
        "DECOMMISSIONED": {"action": "SET_LIFECYCLE", "params": {"state": "DECOMMISSIONED"}},
    }
    command = lifecycle_commands.get(payload.status)
    if command:
        command_id = _queue_device_command(
            device_id,
            command["action"],
            command["params"],
            current_user,
        )

    write_audit_log(current_user["id"], f"CHANGE_STATUS:{device_id}->{payload.status}", request)
    return {
        "message": f"Đã chuyển trạng thái thiết bị sang {payload.status}",
        "command_id": command_id,
        "device": res.data[0]
    }

@router.put("/{device_id}/camera", summary="Gán hoặc gỡ camera hiện trường (Chỉ ADMIN & OPERATOR sở hữu thiết bị)")
def update_device_camera(
    device_id: str,
    payload: DeviceCameraUpdateRequest,
    request: Request,
    device: dict = Depends(require_device_access(["ADMIN", "OPERATOR"])),
    current_user: dict = Depends(get_current_user),
):
    camera_url = payload.camera_url.strip() if payload.camera_url else None
    if camera_url and not camera_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="URL camera phải bắt đầu bằng http:// hoặc https://")

    res = (
        supabase.table("devices")
        .update({
            "camera_url": camera_url,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("device_id", device_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy thiết bị")

    action = "UNLINK_CAMERA" if camera_url is None else "LINK_CAMERA"
    write_audit_log(current_user["id"], f"{action}:{device_id}", request)
    return res.data[0]

@router.get("/{device_id}/camera/snapshot", summary="Lấy ảnh snapshot camera hiện trường")
def get_device_camera_snapshot(
    device_id: str,
    device: dict = Depends(require_device_access(["ADMIN", "OPERATOR", "VIEWER"])),
    current_user: dict = Depends(get_current_user),
):
    camera_url = device.get("camera_url")
    if not camera_url:
        raise HTTPException(status_code=404, detail="Thiết bị chưa được gán camera")

    if camera_url.endswith("/"):
        camera_url = camera_url.rstrip("/") + settings.CAMERA_SNAPSHOT_PATH

    auth = None
    if settings.CAMERA_HTTP_USERNAME or settings.CAMERA_HTTP_PASSWORD:
        auth = (settings.CAMERA_HTTP_USERNAME, settings.CAMERA_HTTP_PASSWORD)

    try:
        with httpx.Client(timeout=5.0, follow_redirects=True, auth=auth) as client:
            camera_response = client.get(camera_url)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Không thể kết nối camera: {exc}") from exc

    if camera_response.status_code in (401, 403):
        raise HTTPException(
            status_code=502,
            detail="Camera yêu cầu Basic Auth. Hãy cấu hình CAMERA_HTTP_USERNAME và CAMERA_HTTP_PASSWORD trong .env.",
        )
    if camera_response.status_code != 200 or not camera_response.content:
        raise HTTPException(
            status_code=502,
            detail=f"Camera trả về HTTP {camera_response.status_code}",
        )

    content_type = camera_response.headers.get("content-type", "image/jpeg").split(";")[0]
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=502, detail="Endpoint camera không trả về dữ liệu ảnh")

    return Response(content=camera_response.content, media_type=content_type)

@router.get("/{device_id}/camera/stream", summary="Proxy MJPEG stream camera hiện trường")
async def get_device_camera_stream(
    device_id: str,
    device: dict = Depends(require_device_access(["ADMIN", "OPERATOR", "VIEWER"], from_query=True)),
    current_user: dict = Depends(get_current_user_query),
):
    camera_url = device.get("camera_url")
    if not camera_url:
        raise HTTPException(status_code=404, detail="Thiết bị chưa được gán camera")

    if camera_url.endswith("/shot.jpg"):
        camera_url = camera_url[:-len("/shot.jpg")] + "/video"
    elif camera_url.endswith("/"):
        camera_url = camera_url.rstrip("/") + "/video"

    auth = None
    if settings.CAMERA_HTTP_USERNAME or settings.CAMERA_HTTP_PASSWORD:
        auth = (settings.CAMERA_HTTP_USERNAME, settings.CAMERA_HTTP_PASSWORD)

    client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=5.0, read=None, write=5.0, pool=5.0),
        follow_redirects=True,
        auth=auth,
    )
    try:
        request = client.build_request("GET", camera_url)
        camera_response = await client.send(request, stream=True)
    except httpx.HTTPError as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Không thể kết nối camera: {exc}") from exc

    if camera_response.status_code in (401, 403):
        await camera_response.aclose()
        await client.aclose()
        raise HTTPException(status_code=502, detail="Camera yêu cầu Basic Auth hoặc thông tin xác thực không đúng.")
    if camera_response.status_code != 200:
        status_code = camera_response.status_code
        await camera_response.aclose()
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Camera trả về HTTP {status_code}")

    async def stream_content():
        try:
            async for chunk in camera_response.aiter_bytes():
                yield chunk
        finally:
            await camera_response.aclose()
            await client.aclose()

    media_type = camera_response.headers.get("content-type", "multipart/x-mixed-replace")
    return StreamingResponse(stream_content(), media_type=media_type)

@router.post("/{device_id}/provision", summary="Cấp phát lại ID cho ESP32 nguồn (Chỉ ADMIN)")
def provision_existing_device(
    device_id: str,
    payload: DeviceProvisionRequest,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN"])),
):
    if device_id == payload.source_device_id:
        raise HTTPException(status_code=400, detail="Thiết bị nguồn phải khác thiết bị đích")

    target_res = (
        supabase.table("devices")
        .select("device_id, auth_token, status")
        .eq("device_id", device_id)
        .execute()
    )
    if not target_res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy thiết bị đích")

    target = target_res.data[0]
    command_id = _queue_device_command(
        payload.source_device_id,
        "PROVISION_DEVICE",
        {
            "new_device_id": device_id,
            "device_token": target.get("auth_token", ""),
        },
        current_user,
        log_device_id=device_id,
    )
    write_audit_log(current_user["id"], f"PROVISION_DEVICE:{payload.source_device_id}->{device_id}", request)
    return {
        "message": f"Đã gửi lệnh provision từ {payload.source_device_id} sang {device_id}",
        "command_id": command_id,
        "device": target,
    }

@router.delete("/{device_id}", summary="Xóa liên kết thiết bị đã thu hồi (Chỉ ADMIN)")
def delete_decommissioned_device(
    device_id: str,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN"])),
):
    device_res = (
        supabase.table("devices")
        .select("device_id, status")
        .eq("device_id", device_id)
        .execute()
    )
    if not device_res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy thiết bị")
    if device_res.data[0].get("status") != "DECOMMISSIONED":
        raise HTTPException(
            status_code=409,
            detail="Chỉ được xóa liên kết sau khi thiết bị đã DECOMMISSIONED"
        )

    deleted = supabase.table("devices").delete().eq("device_id", device_id).execute()
    if not deleted.data:
        raise HTTPException(status_code=404, detail="Không thể xóa liên kết thiết bị")

    write_audit_log(current_user["id"], f"DELETE_DEVICE_LINK:{device_id}", request)
    return {
        "message": f"Đã xóa liên kết thiết bị {device_id}",
        "device_id": device_id,
    }

DEVICE_ONLINE_WINDOW_SEC = 10


def _is_device_online(device: dict, max_stale_sec: int = DEVICE_ONLINE_WINDOW_SEC) -> bool:
    if device.get("status") not in ("ACTIVE", "ONLINE", "PROVISIONED"):
        return False
    raw_last_seen = device.get("last_seen")
    if not raw_last_seen:
        return False
    try:
        if isinstance(raw_last_seen, (int, float)):
            last_seen_dt = datetime.fromtimestamp(float(raw_last_seen), tz=timezone.utc)
        elif isinstance(raw_last_seen, str):
            last_seen_dt = datetime.fromisoformat(raw_last_seen.replace("Z", "+00:00"))
            if last_seen_dt.tzinfo is None:
                last_seen_dt = last_seen_dt.replace(tzinfo=timezone.utc)
        else:
            return False
    except (ValueError, TypeError, OSError):
        return False
    return (datetime.now(timezone.utc) - last_seen_dt).total_seconds() <= max_stale_sec


@router.put("/{device_id}/thresholds", summary="Cập nhật ngưỡng khói và nhiệt độ từ xa (ADMIN & OPERATOR sở hữu thiết bị)")
def update_device_thresholds(
    device_id: str,
    payload: ThresholdUpdateRequest,
    request: Request,
    device: dict = Depends(require_device_access(["ADMIN", "OPERATOR"])),
    current_user: dict = Depends(get_current_user),
):
    if device.get("status") == "DECOMMISSIONED":
        raise HTTPException(
            status_code=400,
            detail="Thiết bị đã bị thu hồi (DECOMMISSIONED), không thể cập nhật ngưỡng cảnh báo"
        )
    if not _is_device_online(device):
        raise HTTPException(
            status_code=409,
            detail="Thiết bị đang ngoại tuyến (OFFLINE), chỉ có thể cập nhật ngưỡng khi thiết bị ONLINE"
        )

    res = supabase.table("devices").update({
        "smoke_threshold": payload.smoke_threshold,
        "temp_threshold": payload.temp_threshold,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).eq("device_id", device_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy thiết bị")

    command_id = _queue_device_command(
        device_id,
        "UPDATE_THRESHOLD",
        {
            "smoke_threshold": payload.smoke_threshold,
            "temp_threshold": payload.temp_threshold,
        },
        current_user,
    )

    write_audit_log(current_user["id"], f"UPDATE_THRESHOLDS:{device_id}", request)
    return {
        "command_id": command_id,
        "device": res.data[0],
    }
