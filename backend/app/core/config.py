from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    
    MQTT_BROKER_HOST: str = "mosquitto"
    MQTT_BROKER_PORT: int = 1883
    
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    
    # Cấu hình Camera IP / Điện thoại IP Webcam
    CAMERA_SNAPSHOT_URL: str = "http://192.168.1.238:8080/shot.jpg"
    CAMERA_STREAM_URL: str = "http://192.168.1.238:8080/video"
    CAMERA_HTTP_USERNAME: str = ""
    CAMERA_HTTP_PASSWORD: str = ""
    CAMERA_SNAPSHOT_PATH: str = "/shot.jpg"
    
    JWT_SECRET: str = "fire-alert-iot-nhom14-secret-key-32bytes-min-security-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24

    ALERT_COOLDOWN_SEC: int = 60

    class Config:
        env_file = (".env", "../.env")
        extra = "ignore"

settings = Settings()
