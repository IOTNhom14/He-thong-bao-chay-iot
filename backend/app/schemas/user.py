from typing import Optional, Literal
from pydantic import BaseModel, Field

UserRole = Literal["ADMIN", "OPERATOR", "VIEWER"]

class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, example="operator_k1")
    password: str = Field(..., min_length=6, example="Operator@123456")
    role: UserRole = Field("OPERATOR", example="OPERATOR")
    email: str = Field(..., min_length=5, max_length=255, example="operator@firealert.iot")
    full_name: Optional[str] = Field(None, example="Kỹ Thuật Viên Ca 1")

class UserRoleUpdateRequest(BaseModel):
    role: UserRole = Field(..., example="OPERATOR")

class UserStatusUpdateRequest(BaseModel):
    is_active: Optional[bool] = Field(None, description="Trạng thái kích hoạt tài khoản")
    unlock: Optional[bool] = Field(None, description="Mở khóa tài khoản khi bị khóa tạm thời")

class UserDeviceAssignRequest(BaseModel):
    device_id: str = Field(..., example="ESP32_FIRE_001")

class LoginRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: str
