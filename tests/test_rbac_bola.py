import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

import os
import sys
from pathlib import Path

# Cấu hình biến môi trường giả lập trước khi nạp module
os.environ["SUPABASE_URL"] = "https://mock-test.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNTE2MjM5MDIyfQ.4xHh_T3P63yUv_zJvZK4cT4Kz_yJvZK4cT4Kz_yJvZs"
os.environ["JWT_SECRET"] = "test-secure-jwt-secret-key-min-32-chars-9a8b7c6d5e4f3a2b1c"

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from app.core.security import require_device_access

class TestRbacBolaDeviceAccess(unittest.TestCase):
    def setUp(self):
        self.dev_001 = {
            "device_id": "ESP32_FIRE_001",
            "name": "Living Room Node",
            "assigned_user_id": "user-uuid-operator-1",
            "status": "ACTIVE"
        }
        self.dev_002 = {
            "device_id": "ESP32_FIRE_002",
            "name": "Kitchen Node",
            "assigned_user_id": "user-uuid-operator-2",
            "status": "ACTIVE"
        }

    @patch("app.core.security.supabase")
    def test_admin_can_access_any_device(self, mock_supabase):
        mock_query = MagicMock()
        mock_query.select.return_value.eq.return_value.execute.return_value.data = [self.dev_001]
        mock_supabase.table.return_value = mock_query

        dep = require_device_access(["ADMIN", "OPERATOR"])
        admin_user = {"id": "admin-uuid", "role": "ADMIN", "email": "admin@iot.vn"}

        # Admin accesses device owned by operator-1
        result = dep(device_id="ESP32_FIRE_001", current_user=admin_user)
        self.assertEqual(result["device_id"], "ESP32_FIRE_001")

    @patch("app.core.security.supabase")
    def test_operator_can_access_own_device(self, mock_supabase):
        mock_query = MagicMock()
        mock_query.select.return_value.eq.return_value.execute.return_value.data = [self.dev_001]
        mock_supabase.table.return_value = mock_query

        dep = require_device_access(["ADMIN", "OPERATOR"])
        operator_1 = {"id": "user-uuid-operator-1", "role": "OPERATOR", "email": "op1@iot.vn"}

        result = dep(device_id="ESP32_FIRE_001", current_user=operator_1)
        self.assertEqual(result["device_id"], "ESP32_FIRE_001")

    @patch("app.core.security.supabase")
    def test_operator_blocked_from_other_operator_device(self, mock_supabase):
        mock_query = MagicMock()
        mock_query.select.return_value.eq.return_value.execute.return_value.data = [self.dev_002]
        mock_supabase.table.return_value = mock_query

        dep = require_device_access(["ADMIN", "OPERATOR"])
        operator_1 = {"id": "user-uuid-operator-1", "role": "OPERATOR", "email": "op1@iot.vn"}

        # Operator 1 tries to access device assigned to Operator 2
        with self.assertRaises(HTTPException) as ctx:
            dep(device_id="ESP32_FIRE_002", current_user=operator_1)

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("Bạn không được phân công quản lý thiết bị này", ctx.exception.detail)

    @patch("app.core.security.supabase")
    def test_viewer_blocked_from_control_endpoint(self, mock_supabase):
        dep = require_device_access(["ADMIN", "OPERATOR"])
        viewer = {"id": "viewer-uuid", "role": "VIEWER", "email": "viewer@iot.vn"}

        with self.assertRaises(HTTPException) as ctx:
            dep(device_id="ESP32_FIRE_001", current_user=viewer)

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("Truy cập bị từ chối", ctx.exception.detail)

    @patch("app.core.security.supabase")
    def test_nonexistent_device_returns_404(self, mock_supabase):
        mock_query = MagicMock()
        mock_query.select.return_value.eq.return_value.execute.return_value.data = []
        mock_supabase.table.return_value = mock_query

        dep = require_device_access(["ADMIN", "OPERATOR"])
        admin_user = {"id": "admin-uuid", "role": "ADMIN", "email": "admin@iot.vn"}

        with self.assertRaises(HTTPException) as ctx:
            dep(device_id="NON_EXISTENT_DEVICE", current_user=admin_user)

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Thiết bị không tồn tại", ctx.exception.detail)

    @patch("app.api.v1.endpoints.devices.supabase")
    def test_list_devices_operator_scoping(self, mock_devices_sb):
        from app.api.v1.endpoints.devices import list_devices

        mock_query = MagicMock()
        mock_query.select.return_value.order.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.execute.return_value.data = [self.dev_001]
        mock_devices_sb.table.return_value = mock_query

        op_user = {"id": "user-uuid-operator-1", "role": "OPERATOR"}
        devices = list_devices(current_user=op_user)

        # Kiểm tra lệnh truy vấn phải gọi .eq("assigned_user_id", "user-uuid-operator-1")
        mock_query.eq.assert_called_with("assigned_user_id", "user-uuid-operator-1")
        self.assertEqual(len(devices), 1)
        self.assertEqual(devices[0]["device_id"], "ESP32_FIRE_001")

    @patch("app.api.v1.endpoints.devices.supabase")
    def test_list_devices_admin_unscoped(self, mock_devices_sb):
        from app.api.v1.endpoints.devices import list_devices

        mock_query = MagicMock()
        mock_query.select.return_value.order.return_value = mock_query
        mock_query.execute.return_value.data = [self.dev_001, self.dev_002]
        mock_devices_sb.table.return_value = mock_query

        admin_user = {"id": "admin-uuid", "role": "ADMIN"}
        devices = list_devices(current_user=admin_user)

        # Admin không bị gán .eq("assigned_user_id", ...)
        mock_query.eq.assert_not_called()
        self.assertEqual(len(devices), 2)

    @patch("app.api.v1.endpoints.alerts.supabase")
    def test_acknowledge_alert_operator_unassigned_blocked(self, mock_alerts_sb):
        from app.api.v1.endpoints.alerts import acknowledge_alert

        # Giả lập cảnh báo thuộc về ESP32_FIRE_002
        mock_alert_query = MagicMock()
        mock_alert_query.select.return_value.eq.return_value.execute.return_value.data = [
            {"id": 99, "device_id": "ESP32_FIRE_002", "status": "TRIGGERED"}
        ]

        # Giả lập thiết bị ESP32_FIRE_002 thuộc về operator-2
        mock_dev_query = MagicMock()
        mock_dev_query.select.return_value.eq.return_value.execute.return_value.data = [
            {"assigned_user_id": "user-uuid-operator-2"}
        ]

        def table_router(table_name):
            if table_name == "alerts":
                return mock_alert_query
            elif table_name == "devices":
                return mock_dev_query
            return MagicMock()

        mock_alerts_sb.table.side_effect = table_router

        # Operator 1 cố tình xác nhận alert của Operator 2
        op_1 = {"id": "user-uuid-operator-1", "role": "OPERATOR"}
        req = MagicMock()

        with self.assertRaises(HTTPException) as ctx:
            acknowledge_alert(alert_id=99, request=req, current_user=op_1)

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("Cảnh báo này thuộc thiết bị bạn không được phân công quản lý", ctx.exception.detail)

    @patch("app.api.v1.endpoints.users.supabase")
    def test_create_user_db_failure_raises_http_500(self, mock_users_sb):
        from app.api.v1.endpoints.users import create_user
        from app.schemas.user import UserCreateRequest

        mock_dup_query = MagicMock()
        mock_dup_query.select.return_value.or_.return_value.limit.return_value.execute.return_value.data = []

        mock_insert_query = MagicMock()
        mock_insert_query.upsert.return_value.execute.side_effect = Exception("Database connection lost")

        def user_table_router(table_name):
            if table_name == "users":
                # First call is duplicate check, second call is upsert
                return mock_dup_query if mock_dup_query.select.called else mock_insert_query
            return MagicMock()

        mock_users_sb.table.return_value.select.return_value.or_.return_value.limit.return_value.execute.return_value.data = []
        mock_users_sb.table.return_value.upsert.return_value.execute.side_effect = Exception("Database connection lost")

        payload = UserCreateRequest(
            username="new_operator",
            password="Password123!",
            role="OPERATOR",
            email="new_op@iot.vn",
            full_name="New Operator"
        )
        req = MagicMock()
        admin_user = {"id": "admin-uuid", "role": "ADMIN"}

        # Đảm bảo Exception từ Database không bị nuốt, mà ném ra HTTP 500
        with self.assertRaises(HTTPException) as ctx:
            create_user(payload=payload, request=req, current_user=admin_user)

        self.assertEqual(ctx.exception.status_code, 500)
        self.assertIn("Lỗi lưu trữ người dùng", ctx.exception.detail)

    @patch("app.api.v1.endpoints.users.supabase")
    def test_create_user_duplicate_email_raises_http_409(self, mock_users_sb):
        from app.api.v1.endpoints.users import create_user
        from app.schemas.user import UserCreateRequest

        # Giả lập đã tồn tại user trùng email
        mock_users_sb.table.return_value.select.return_value.or_.return_value.limit.return_value.execute.return_value.data = [
            {"id": "existing-uuid"}
        ]

        payload = UserCreateRequest(
            username="existing_user",
            password="Password123!",
            role="OPERATOR",
            email="existing@iot.vn"
        )
        req = MagicMock()
        admin_user = {"id": "admin-uuid", "role": "ADMIN"}

        with self.assertRaises(HTTPException) as ctx:
            create_user(payload=payload, request=req, current_user=admin_user)

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("đã tồn tại trong hệ thống", ctx.exception.detail)

    def test_jwt_secret_strength_validation(self):
        from app.core.config import Settings

        # Secret ngắn hơn 32 ký tự phải bị từ chối
        with self.assertRaises(ValueError):
            Settings.validate_jwt_secret_strength("short_secret")

        # Secret mặc định cũ phải bị từ chối
        with self.assertRaises(ValueError):
            Settings.validate_jwt_secret_strength("fire-alert-iot-nhom14-secret-key-32bytes-min-security-production")

        # Secret hợp lệ >= 32 ký tự được chấp nhận
        valid_secret = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
        self.assertEqual(Settings.validate_jwt_secret_strength(valid_secret), valid_secret)

    @patch("app.api.v1.endpoints.audit.supabase")
    def test_audit_logs_action_alias_and_username_mapping(self, mock_audit_sb):
        from app.api.v1.endpoints.audit import get_audit_logs

        mock_users_q = MagicMock()
        mock_users_q.select.return_value.execute.return_value.data = [
            {"id": "uuid-admin-1", "username": "admin_ptit", "email": "admin@firealert.iot"}
        ]

        mock_logs_q = MagicMock()
        mock_logs_q.select.return_value = mock_logs_q
        mock_logs_q.or_.return_value = mock_logs_q
        mock_logs_q.ilike.return_value = mock_logs_q
        mock_logs_q.order.return_value = mock_logs_q
        mock_logs_q.range.return_value = mock_logs_q
        mock_logs_q.execute.return_value.count = 2
        mock_logs_q.execute.return_value.data = [
            {
                "id": 10,
                "user_id": "uuid-admin-1",
                "action": "SEND_COMMAND:MUTE_BUZZER->To:ESP32_FIRE_001",
                "ip_address": "127.0.0.1",
                "created_at": "2026-11-18T00:00:00+00:00",
            },
            {
                "id": 11,
                "user_id": "bad_actor",
                "action": "LOGIN_FAILED:bad_actor",
                "ip_address": "10.0.0.2",
                "created_at": "2026-11-18T00:01:00+00:00",
            },
        ]

        def route_table(name):
            return mock_users_q if name == "users" else mock_logs_q

        mock_audit_sb.table.side_effect = route_table

        res = get_audit_logs(
            action="COMMAND_SENT",
            username=None,
            from_date=None,
            to_date=None,
            limit=50,
            offset=0,
            current_user={"id": "uuid-admin-1", "role": "ADMIN"},
        )

        # Kiểm tra alias COMMAND_SENT ánh xạ sang cả SEND_COMMAND lẫn COMMAND_SENT
        mock_logs_q.or_.assert_called_once_with("action.ilike.*SEND_COMMAND*,action.ilike.*COMMAND_SENT*")
        self.assertEqual(res["total"], 2)
        self.assertEqual(res["data"][0]["username"], "admin_ptit")
        self.assertEqual(res["data"][0]["action"], "SEND_COMMAND")
        self.assertEqual(res["data"][0]["target"], "MUTE_BUZZER->To:ESP32_FIRE_001")
        self.assertTrue(res["data"][0]["success"])
        self.assertEqual(res["data"][1]["action"], "LOGIN_FAILED")
        self.assertFalse(res["data"][1]["success"])

    @patch("app.api.v1.endpoints.audit.supabase")
    def test_audit_logs_compound_action_and_username_filter(self, mock_audit_sb):
        import httpx
        from app.api.v1.endpoints.audit import get_audit_logs

        mock_users_q = MagicMock()
        mock_users_q.select.return_value.execute.return_value.data = [
            {"id": "uuid-admin-1", "username": "admin_ptit", "email": "admin@firealert.iot"}
        ]

        mock_logs_q = MagicMock()
        mock_logs_q.params = httpx.QueryParams()
        mock_logs_q.select.return_value = mock_logs_q
        mock_logs_q.order.return_value = mock_logs_q
        mock_logs_q.range.return_value = mock_logs_q
        mock_logs_q.execute.return_value.count = 0
        mock_logs_q.execute.return_value.data = []

        mock_audit_sb.table.side_effect = lambda name: mock_users_q if name == "users" else mock_logs_q

        get_audit_logs(
            action="SEND_COMMAND",
            username="admin_ptit",
            from_date=None,
            to_date=None,
            limit=50,
            offset=0,
            current_user={"id": "uuid-admin-1", "role": "ADMIN"},
        )

        and_param = mock_logs_q.params.get("and")
        self.assertIsNotNone(and_param)
        self.assertIn("action.ilike.*SEND_COMMAND*", and_param)
        self.assertIn("user_id.in.(uuid-admin-1)", and_param)

    @patch("app.api.v1.endpoints.auth.write_audit_log")
    @patch("app.api.v1.endpoints.auth.supabase")
    def test_login_writes_audit_log_on_failure(self, mock_auth_sb, mock_write_audit):
        from app.api.v1.endpoints.auth import login
        from app.schemas.user import LoginRequest

        mock_auth_sb.table.return_value.select.return_value.or_.return_value.limit.return_value.execute.return_value.data = []
        req = MagicMock()

        with self.assertRaises(HTTPException) as ctx:
            login(payload=LoginRequest(username="unknown_user", password="wrong"), request=req)

        self.assertEqual(ctx.exception.status_code, 401)
        mock_write_audit.assert_called_once_with("unknown_user", "LOGIN_FAILED:unknown_user", req)

    def test_update_thresholds_decommissioned_device_blocked(self):
        from app.api.v1.endpoints.devices import update_device_thresholds
        from app.schemas.device import ThresholdUpdateRequest

        decommissioned_dev = {
            "device_id": "ESP32_FIRE_001",
            "status": "DECOMMISSIONED",
            "assigned_user_id": "user-uuid-operator-1",
        }
        payload = ThresholdUpdateRequest(smoke_threshold=450.0, temp_threshold=60.0)
        req = MagicMock()
        admin_user = {"id": "admin-uuid", "role": "ADMIN"}

        with self.assertRaises(HTTPException) as ctx:
            update_device_thresholds(
                device_id="ESP32_FIRE_001",
                payload=payload,
                request=req,
                device=decommissioned_dev,
                current_user=admin_user,
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("DECOMMISSIONED", ctx.exception.detail)

    def test_update_thresholds_offline_or_stale_device_blocked(self):
        from datetime import datetime, timedelta, timezone
        from app.api.v1.endpoints.devices import update_device_thresholds, _is_device_online
        from app.schemas.device import ThresholdUpdateRequest

        payload = ThresholdUpdateRequest(smoke_threshold=450.0, temp_threshold=60.0)
        req = MagicMock()
        admin_user = {"id": "admin-uuid", "role": "ADMIN"}

        # 1. Trạng thái OFFLINE -> HTTP 409
        offline_dev = {
            "device_id": "ESP32_FIRE_001",
            "status": "OFFLINE",
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }
        with self.assertRaises(HTTPException) as ctx1:
            update_device_thresholds(
                device_id="ESP32_FIRE_001",
                payload=payload,
                request=req,
                device=offline_dev,
                current_user=admin_user,
            )
        self.assertEqual(ctx1.exception.status_code, 409)

        # 2. Trạng thái ACTIVE nhưng last_seen quá hạn (> 10s) -> HTTP 409
        stale_dev = {
            "device_id": "ESP32_FIRE_001",
            "status": "ACTIVE",
            "last_seen": (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat(),
        }
        with self.assertRaises(HTTPException) as ctx2:
            update_device_thresholds(
                device_id="ESP32_FIRE_001",
                payload=payload,
                request=req,
                device=stale_dev,
                current_user=admin_user,
            )
        self.assertEqual(ctx2.exception.status_code, 409)

        # 3. Trạng thái ACTIVE và last_seen mới -> ONLINE
        online_dev = {
            "device_id": "ESP32_FIRE_001",
            "status": "ACTIVE",
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }
        self.assertTrue(_is_device_online(online_dev))

if __name__ == "__main__":
    unittest.main()
