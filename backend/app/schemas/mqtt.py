from typing import Optional, Literal
from pydantic import BaseModel, Field

class TelemetryUnits(BaseModel):
    """Đơn vị đo lường tương ứng của các cảm biến theo chuẩn đề tài"""
    gas: str = Field(default="ppm", description="Đơn vị nồng độ khói/khí gas")
    temperature: str = Field(default="C", description="Đơn vị nhiệt độ (°C)")
    humidity: str = Field(default="%", description="Đơn vị độ ẩm không khí (%)")

class TelemetryPayload(BaseModel):
    """Bản tin Telemetry gửi định kỳ từ vi điều khiển ESP32 qua MQTT"""
    device_id: str
    timestamp: Optional[int] = None
    gas_ppm: float = Field(..., ge=0, le=10000, description="Nồng độ khí gas/khói đọc từ MQ-2 (PPM)")
    temperature: Optional[float] = Field(None, ge=-40, le=125, description="Nhiệt độ đọc từ DHT22 (°C)")
    humidity: Optional[float] = Field(None, ge=0, le=100, description="Độ ẩm không khí (%)")
    units: Optional[TelemetryUnits] = Field(
        default_factory=TelemetryUnits,
        description="Đơn vị đo lường tương ứng của các thông số"
    )
    flame_detected: bool = Field(default=False, description="Trạng thái phát hiện lửa từ cảm biến hồng ngoại")
    local_alarm: bool = Field(default=False, description="Trạng thái còi hú cục bộ trên mạch")
    is_muted: bool = Field(default=False, description="Trạng thái tắt còi tạm thời")

class StatusPayload(BaseModel):
    """Bản tin trạng thái kết nối & LWT từ ESP32/Broker"""
    device_id: str
    status: Literal["ONLINE", "OFFLINE"]
    firmware_version: Optional[str] = None
    reason: Optional[str] = None

class AckPayload(BaseModel):
    """Bản tin phản hồi xác nhận lệnh điều khiển từ ESP32"""
    command_id: str
    device_id: str
    status: Literal["SUCCESS", "FAILED"]
    message: Optional[str] = None
