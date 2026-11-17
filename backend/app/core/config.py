from pydantic import field_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    
    MQTT_BROKER_HOST: str = "mosquitto"
    MQTT_BROKER_PORT: int = 1883
    MQTT_BROKER_USER: str = "backend_worker"
    MQTT_BROKER_PASSWORD: str = "backend_secret_mqtt_token_nhom14"
    
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    
    # Cấu hình Camera IP / Điện thoại IP Webcam
    CAMERA_SNAPSHOT_URL: str = "http://192.168.1.238:8080/shot.jpg"
    CAMERA_STREAM_URL: str = "http://192.168.1.238:8080/video"
    CAMERA_HTTP_USERNAME: str = ""
    CAMERA_HTTP_PASSWORD: str = ""
    CAMERA_SNAPSHOT_PATH: str = "/shot.jpg"
    
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24

    ALERT_COOLDOWN_SEC: int = 60

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_jwt_secret_strength(cls, v: str) -> str:
        weak_defaults = {
            "fire-alert-iot-nhom14-secret-key-32bytes-min-security-production",
            "secret",
            "changeme",
            "default",
            "admin",
        }
        cleaned = v.strip()
        if len(cleaned) < 32:
            raise ValueError("JWT_SECRET bắt buộc phải có độ dài tối thiểu 32 ký tự.")
        if cleaned.lower() in weak_defaults or cleaned.startswith("<replace-with"):
            raise ValueError("JWT_SECRET không được phép sử dụng chuỗi mặc định hoặc placeholder.")
        return cleaned

    class Config:
        env_file = (".env", "../.env")
        extra = "ignore"

settings = Settings()
