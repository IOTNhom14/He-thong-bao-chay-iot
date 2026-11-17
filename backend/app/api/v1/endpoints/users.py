import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.database import supabase
from app.core.security import get_password_hash, require_roles, write_audit_log
from app.schemas.user import (
    UserCreateRequest,
    UserDeviceAssignRequest,
    UserRoleUpdateRequest,
    UserStatusUpdateRequest,
)

router = APIRouter(prefix="/users", tags=["Quản Trị Người Dùng & RBAC"])

def _resolve_username(user: dict) -> str:
    return user.get("username") or (user["email"].split("@")[0] if user.get("email") else str(user["id"]))

def _format_user_item(user: dict, assigned: Optional[List[str]] = None) -> dict:
    uname = _resolve_username(user)
    is_act = bool(user.get("is_active", True))
    devices = assigned if assigned is not None else user.get("assigned_devices", [])
    created = user.get("created_at") or datetime.now(timezone.utc).isoformat()
    return {
        "id": str(user["id"]),
        "username": uname,
        "email": user.get("email"),
        "role": user.get("role", "VIEWER"),
        "is_active": is_act,
        "isActive": is_act,
        "failed_attempts": 0,
        "failedAttempts": 0,
        "locked_until": None,
        "lockedUntil": None,
        "created_at": created,
        "createdAt": created,
        "assigned_devices": devices,
        "assignedDevices": devices,
    }

def _fetch_device_assignments() -> Dict[str, List[str]]:
    mapping: Dict[str, List[str]] = {}
    try:
        dev_res = (
            supabase.table("devices")
            .select("device_id, assigned_user_id")
            .not_.is_("assigned_user_id", "null")
            .execute()
        )
        for row in dev_res.data or []:
            uid = str(row["assigned_user_id"])
            mapping.setdefault(uid, []).append(row["device_id"])
    except Exception:
        pass
    return mapping

@router.get("", summary="Lấy danh sách tất cả người dùng (Chỉ ADMIN)")
def list_users(current_user: dict = Depends(require_roles(["ADMIN"]))):
    mapping = _fetch_device_assignments()
    users_list = []

    # 1. Truy vấn từ Supabase table 'users'
    try:
        res = supabase.table("users").select("*").order("created_at", desc=True).execute()
        if res.data:
            for u in res.data:
                users_list.append(_format_user_item(u, mapping.get(str(u["id"]), [])))
    except Exception as exc:
        print(f"[USERS DB] Lỗi lấy danh sách người dùng: {exc}")

    return users_list

@router.post("", status_code=status.HTTP_201_CREATED, summary="Tạo tài khoản người dùng mới (Chỉ ADMIN)")
def create_user(
    payload: UserCreateRequest,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN"]))
):
    email = payload.email.strip().lower()
    username = payload.username.strip()
    if not email or not username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email và tên đăng nhập không được để trống"
        )
    full_name = payload.full_name or username
    user_id = None
    auth_created = False

    try:
        dup_check = (
            supabase.table("users")
            .select("id")
            .or_(f"email.eq.{email},username.eq.{username}")
            .limit(1)
            .execute()
        )
        if dup_check.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email hoặc tên đăng nhập đã tồn tại trong hệ thống"
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể kiểm tra dữ liệu người dùng: {str(exc)}"
        ) from exc

    try:
        auth_res = supabase.auth.admin.create_user({
            "email": email,
            "password": payload.password,
            "email_confirm": True,
            "user_metadata": {
                "full_name": full_name,
                "role": payload.role
            }
        })
        if auth_res and auth_res.user:
            user_id = str(auth_res.user.id)
            auth_created = True
    except Exception as exc:
        err_msg = str(exc).lower()
        if "already registered" in err_msg or "already exists" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email này đã được đăng ký trong hệ thống xác thực"
            ) from exc
        print(f"[AUTH CREATE WARN] Supabase Auth Admin không khả dụng, sử dụng local auth: {exc}")

    if not user_id:
        user_id = str(uuid.uuid4())

    user_data = {
        "id": user_id,
        "username": username,
        "email": email,
        "password_hash": get_password_hash(payload.password),
        "full_name": full_name,
        "role": payload.role,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    try:
        db_res = supabase.table("users").upsert(user_data).execute()
        if not db_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Không thể lưu thông tin tài khoản vào cơ sở dữ liệu"
            )
    except HTTPException:
        raise
    except Exception as exc:
        if auth_created and user_id:
            try:
                supabase.auth.admin.delete_user(user_id)
            except Exception:
                pass
        err_msg = str(exc).lower()
        if "duplicate" in err_msg or "23505" in err_msg or "unique" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Tên đăng nhập hoặc email đã được sử dụng"
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi lưu trữ người dùng vào CSDL: {str(exc)}"
        ) from exc

    user_data["assigned_devices"] = []

    write_audit_log(current_user["id"], f"CREATE_USER:{username}:{payload.role}", request)
    formatted = _format_user_item(user_data, [])
    return {"success": True, "message": "Tạo người dùng thành công", "data": formatted}

@router.get("/{user_id}", summary="Lấy chi tiết người dùng kèm thiết bị được phân công")
def get_user_detail(user_id: str, current_user: dict = Depends(require_roles(["ADMIN"]))):
    mapping = _fetch_device_assignments()
    user_data = None

    try:
        res = supabase.table("users").select("*").eq("id", user_id).single().execute()
        if res.data:
            user_data = res.data
    except Exception:
        pass

    if not user_data:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    return _format_user_item(user_data, mapping.get(user_id))

@router.patch("/{user_id}/role", summary="Thay đổi vai trò người dùng (Chỉ ADMIN)")
def update_user_role(
    user_id: str,
    payload: UserRoleUpdateRequest,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN"]))
):
    if str(current_user.get("id")) == user_id:
        raise HTTPException(status_code=400, detail="Không thể tự hạ vai trò quản trị của chính mình")

    updated = False
    try:
        res = supabase.table("users").update({"role": payload.role}).eq("id", user_id).execute()
        if res.data:
            updated = True
    except Exception as exc:
        print(f"[USERS DB] Lỗi cập nhật vai trò: {exc}")

    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng để cập nhật")

    write_audit_log(current_user["id"], f"UPDATE_ROLE:{user_id}->{payload.role}", request)
    return {
        "success": True,
        "message": f"Đã đổi vai trò sang {payload.role}",
        "data": {"id": user_id, "username": user_id, "role": payload.role}
    }

@router.patch("/{user_id}/status", summary="Khóa hoặc mở khóa tài khoản (Chỉ ADMIN)")
def update_user_status(
    user_id: str,
    payload: UserStatusUpdateRequest,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN"]))
):
    next_active = payload.is_active if payload.is_active is not None else (True if payload.unlock else False)

    if str(current_user.get("id")) == user_id and not next_active:
        raise HTTPException(status_code=400, detail="Không thể tự khóa tài khoản quản trị của chính mình")

    updated = False
    try:
        res = supabase.table("users").update({"is_active": next_active}).eq("id", user_id).execute()
        if res.data:
            updated = True
    except Exception as exc:
        print(f"[USERS DB] Lỗi cập nhật trạng thái: {exc}")

    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng để cập nhật")

    action_label = "Mở khóa" if next_active else "Khóa"
    write_audit_log(current_user["id"], f"STATUS_USER:{user_id}->active={next_active}", request)
    return {
        "success": True,
        "message": f"Đã {action_label.lower()} tài khoản thành công",
        "data": {
            "id": user_id,
            "username": user_id,
            "isActive": next_active,
            "failedAttempts": 0,
            "lockedUntil": None
        }
    }

@router.delete("/{user_id}", summary="Xóa người dùng (Chỉ ADMIN)")
def delete_user(
    user_id: str,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN"]))
):
    if str(current_user.get("id")) == user_id:
        raise HTTPException(status_code=400, detail="Không thể tự xóa tài khoản của chính mình")

    try:
        supabase.table("devices").update({"assigned_user_id": None}).eq("assigned_user_id", user_id).execute()
        supabase.table("users").delete().eq("id", user_id).execute()
        try:
            supabase.auth.admin.delete_user(user_id)
        except Exception:
            pass
    except Exception as exc:
        print(f"[USERS DB] Lỗi xóa người dùng: {exc}")

    write_audit_log(current_user["id"], f"DELETE_USER:{user_id}", request)
    return {"success": True, "message": f"Đã xóa tài khoản {user_id}"}

@router.post("/{user_id}/devices", summary="Gán thiết bị cho người dùng (Chỉ ADMIN)")
def assign_device(
    user_id: str,
    payload: UserDeviceAssignRequest,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN"]))
):
    try:
        supabase.table("devices").update({"assigned_user_id": user_id}).eq("device_id", payload.device_id).execute()
    except Exception as exc:
        print(f"[DEVICES DB] Lỗi gán thiết bị: {exc}")

    write_audit_log(current_user["id"], f"ASSIGN_DEVICE:{payload.device_id}->{user_id}", request)
    return {"success": True, "message": f"Đã gán thiết bị {payload.device_id} cho người dùng"}

@router.delete("/{user_id}/devices/{device_id}", summary="Hủy gán thiết bị của người dùng (Chỉ ADMIN)")
def remove_device(
    user_id: str,
    device_id: str,
    request: Request,
    current_user: dict = Depends(require_roles(["ADMIN"]))
):
    try:
        supabase.table("devices").update({"assigned_user_id": None}).eq("device_id", device_id).eq("assigned_user_id", user_id).execute()
    except Exception as exc:
        print(f"[DEVICES DB] Lỗi hủy gán thiết bị: {exc}")

    write_audit_log(current_user["id"], f"REMOVE_DEVICE:{device_id}->{user_id}", request)
    return {"success": True, "message": f"Đã hủy gán thiết bị {device_id}"}
