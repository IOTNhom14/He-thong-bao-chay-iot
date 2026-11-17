from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.core.database import supabase
from app.core.security import create_access_token, get_current_user, verify_password, write_audit_log
from app.schemas.user import LoginRequest

router = APIRouter(prefix="/auth", tags=["Xác Thực Tài Khoản (Auth)"])

@router.post("/login", summary="Đăng nhập hệ thống")
def login(payload: LoginRequest, request: Request):
    identifier = (payload.email or payload.username or "").strip().lower()
    password = payload.password

    if not identifier or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vui lòng cung cấp đầy đủ thông tin đăng nhập và mật khẩu",
        )

    matched_user_id: Optional[str] = None
    try:
        email = identifier if "@" in identifier else f"{identifier}@firealert.iot"
        user_rec = (
            supabase.table("users")
            .select("*")
            .or_(f"username.eq.{identifier},email.eq.{identifier},email.eq.{email}")
            .limit(1)
            .execute()
        )
        if user_rec.data:
            user_data = user_rec.data[0]
            matched_user_id = str(user_data["id"])

            if not user_data.get("is_active", True):
                write_audit_log(matched_user_id, f"LOGIN_FAILED:{identifier}:INACTIVE", request)
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Tài khoản đã bị vô hiệu hóa bởi quản trị viên",
                )

            pwd_hash = user_data.get("password_hash")
            is_valid = verify_password(password, pwd_hash) if pwd_hash else False

            if not is_valid:
                try:
                    auth_res = supabase.auth.sign_in_with_password({"email": email, "password": password})
                    if auth_res and auth_res.user and auth_res.session:
                        is_valid = True
                except Exception:
                    pass

            if is_valid:
                user_id = matched_user_id
                role = user_data.get("role", "VIEWER")
                username = user_data.get("username") or identifier.split("@")[0]
                token = create_access_token({
                    "sub": user_id,
                    "email": user_data.get("email"),
                    "role": role,
                })
                write_audit_log(user_id, f"LOGIN_SUCCESS:{username}", request)
                return {
                    "success": True,
                    "message": "Đăng nhập thành công",
                    "token": token,
                    "user": {
                        "id": user_id,
                        "username": username,
                        "email": user_data.get("email"),
                        "role": role,
                        "fullName": user_data.get("full_name") or f"{role.capitalize()} User"
                    }
                }
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[AUTH LOGIN] Lỗi xử lý đăng nhập: {exc}")

    write_audit_log(matched_user_id or identifier[:100], f"LOGIN_FAILED:{identifier}", request)
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Tài khoản hoặc mật khẩu không chính xác"
    )

@router.get("/me", summary="Lấy thông tin người dùng hiện tại")
def get_me(current_user: dict = Depends(get_current_user)):
    uname = current_user.get("username") or (current_user.get("email", "").split("@")[0] if current_user.get("email") else "user")
    role = current_user.get("role", "VIEWER")
    return {
        "success": True,
        "user": {
            "id": str(current_user.get("id")),
            "username": uname,
            "email": current_user.get("email"),
            "role": role,
            "fullName": current_user.get("full_name") or f"{role.capitalize()} User"
        }
    }
