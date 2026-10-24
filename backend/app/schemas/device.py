from typing import Optional, Literal
from pydantic import BaseModel, Field

class DeviceCreateRequest(BaseModel):
    device_id: str = Field(..., example="ESP32_FIRE_001", description="Mã định danh duy nhất của thiết bị")
    name: str = Field(..., example="Node Báo Cháy Phòng Khách", description="Tên gợi nhớ của thiết bị")
    location: str = Field(..., example="Tầng 1 - Phòng Khách", description="Vị trí lắp đặt thiết bị")
    assigned_user_id: Optional[str] = Field(None, description="ID người dùng quản lý thiết bị này")

class DeviceStatusUpdateRequest(BaseModel):
    status: Literal["REGISTERED", "PROVISIONED", "ACTIVE", "OFFLINE", "MAINTENANCE", "DECOMMISSIONED"]

class ThresholdUpdateRequest(BaseModel):
    smoke_threshold: float = Field(..., gt=50, le=2000, example=400.0, description="Ngưỡng khói báo động (PPM)")
    temp_threshold: float = Field(..., gt=20, le=100, example=55.0, description="Ngưỡng nhiệt độ báo động (°C)")
