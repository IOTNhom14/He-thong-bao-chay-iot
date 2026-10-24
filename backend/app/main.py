from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.api.v1.api import api_router
from app.mqtt.worker import mqtt_worker

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi động dịch vụ MQTT Worker chạy nền
    mqtt_worker.start()
    yield
    # Ngắt kết nối an toàn khi server tắt
    mqtt_worker.stop()

app = FastAPI(
    title="IoT Smart Fire Alert System API",
    description="Hệ thống Backend IoT Cảnh Báo Cháy Thông Minh - Nhóm 14 (IoT và ứng dụng)",
    version="1.0.0",
    lifespan=lifespan
)

# Cấu hình CORS cho phép giao diện Web / Mobile kết nối
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Đăng ký Router chính với tiền tố /api/v1
app.include_router(api_router, prefix="/api/v1")

@app.get("/", include_in_schema=False)
def root():
    """Tự động chuyển hướng về trang tài liệu tương tác Swagger UI"""
    return RedirectResponse(url="/docs")