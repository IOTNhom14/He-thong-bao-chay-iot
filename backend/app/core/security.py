from datetime import datetime, timedelta, timezone
from typing import List, Optional
import bcrypt
import jwt
from fastapi import Depends, HTTPException, Query, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings
from app.core.database import supabase

security = HTTPBearer()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=settings.JWT_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def authenticate_token(token: str) -> dict:
    """
    Xác thực JWT token gửi từ header Authorization: Bearer <token>
    Hỗ trợ cả Local PyJWT Token và fallback sang Supabase Auth Token
    """
    try:
        user_id = None
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            user_id = payload.get("sub")
        except jwt.PyJWTError:
            auth_response = supabase.auth.get_user(token)
            if auth_response and auth_response.user:
                user_id = str(auth_response.user.id)

        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token không hợp lệ hoặc đã hết hạn"
            )

        # Lấy thông tin vai trò từ bảng public.users
        user_record = supabase.table("users").select("*").eq("id", user_id).single().execute()
        if not user_record.data or not user_record.data.get("is_active"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tài khoản đã bị vô hiệu hóa hoặc không tồn tại"
            )

        return user_record.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Xác thực thất bại: {str(e)}"
        )

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    return authenticate_token(credentials.credentials)

def get_current_user_query(token: str = Query(..., alias="access_token")) -> dict:
    return authenticate_token(token)

def require_roles(allowed_roles: List[str]):
    """
    Dependency kiểm tra quyền hạn (Role-Based Access Control - RBAC)
    Chặn truy cập và trả về mã lỗi 403 Forbidden nếu vai trò người dùng không nằm trong allowed_roles
    """
    def role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Truy cập bị từ chối! Quyền yêu cầu: {allowed_roles}, vai trò hiện tại của bạn: {user_role}."
            )
        return current_user
    return role_checker

def write_audit_log(user_id: str, action: str, request: Request) -> None:
    """
    Ghi Audit Log lưu vết các thao tác quản trị nhạy cảm (Mục 4.5 Yêu cầu bảo mật)
    """
    client_ip = request.client.host if request.client else "unknown"
    try:
        supabase.table("audit_logs").insert({
            "user_id": str(user_id),
            "action": action,
            "ip_address": client_ip
        }).execute()
    except Exception as e:
        print(f"[AUDIT LOG ERROR]: {e}")

def ensure_device_access(device_id: str, current_user: dict) -> dict:
    """
    Kiểm tra thiết bị tồn tại và nếu là OPERATOR thì bắt buộc thiết bị phải có assigned_user_id trùng với ID người dùng.
    """
    try:
        res = supabase.table("devices").select("*").eq("device_id", device_id).execute()
        device = res.data[0] if res.data else None
    except Exception as exc:
        print(f"[DEVICE ACCESS ERROR]: {exc}")
        device = None

    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thiết bị")

    if current_user.get("role") == "OPERATOR":
        if str(device.get("assigned_user_id") or "") != str(current_user.get("id") or ""):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Truy cập bị từ chối! Bạn không được phân quyền quản lý thiết bị {device_id}."
            )
    return device
