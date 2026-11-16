import re
from typing import List
from uuid import UUID
from fastapi import Depends, HTTPException, Query, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.database import supabase
from app.core.config import settings

security = HTTPBearer()
DEMO_TOKEN_PATTERN = re.compile(r"^demo_token_(admin|operator|viewer)_[0-9]+$")

def authenticate_token(token: str) -> dict:
    """
    Xác thực JWT token gửi từ header Authorization: Bearer <token>
    Truy vấn thông tin người dùng và vai trò (role) từ Supabase Auth & public.users
    """
    demo_match = DEMO_TOKEN_PATTERN.fullmatch(token)
    if demo_match and settings.ENABLE_DEMO_AUTH:
        role = demo_match.group(1).upper()
        return {
            "id": f"usr_{role.lower()}_demo",
            "email": f"{role.lower()}@firealert.iot",
            "full_name": f"{role} (Demo)",
            "role": role,
            "is_active": True,
        }

    try:
        # Xác thực Token trực tiếp với Supabase Auth
        auth_response = supabase.auth.get_user(token)
        if not auth_response or not auth_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token không hợp lệ hoặc đã hết hạn"
            )
        
        user_id = str(auth_response.user.id)

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
        UUID(str(user_id))
    except ValueError:
        # Demo users are not persisted in Supabase Auth/public.users.
        return

    try:
        supabase.table("audit_logs").insert({
            "user_id": user_id,
            "action": action,
            "ip_address": client_ip
        }).execute()
    except Exception as e:
        print(f"[AUDIT LOG ERROR]: {e}")
