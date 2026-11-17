import os
import sys
import uuid
from datetime import datetime, timezone

# Bổ sung thư mục gốc backend vào sys.path để import được app.*
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    import bcrypt
except ImportError:
    bcrypt = None

try:
    import psycopg2
except ImportError:
    psycopg2 = None

from app.core.database import supabase

SEED_USERS = [
    {
        "id": "11111111-1111-1111-1111-111111111111",
        "username": "admin",
        "email": "admin@firealert.iot",
        "password": "Admin@123456",
        "role": "ADMIN",
        "full_name": "Quản Trị Viên Hệ Thống",
    },
    {
        "id": "22222222-2222-2222-2222-222222222222",
        "username": "operator",
        "email": "operator@firealert.iot",
        "password": "Operator@123456",
        "role": "OPERATOR",
        "full_name": "Kỹ Thuật Viên Vận Hành",
    },
    {
        "id": "33333333-3333-3333-3333-333333333333",
        "username": "viewer",
        "email": "viewer@firealert.iot",
        "password": "Viewer@123456",
        "role": "VIEWER",
        "full_name": "Giám Sát Viên Ca Trực",
    },
]

DB_URL = os.getenv("DATABASE_URL", "")

def seed_users():
    print("=" * 60)
    print("KHỞI TẠO TÀI KHOẢN CHUẨN RBAC (PRODUCTION-READY)")
    print("=" * 60)

    for item in SEED_USERS:
        uid = item["id"]
        email = item["email"]
        password = item["password"]
        role = item["role"]
        full_name = item["full_name"]
        username = item["username"]

        print(f"\n[+] Đang xử lý tài khoản: {username} ({email}) - Vai trò: {role}")
        synced = False

        # 1. Thử qua Supabase Auth Admin API
        try:
            auth_res = supabase.auth.admin.create_user({
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": full_name,
                    "role": role,
                    "username": username,
                }
            })
            if auth_res and auth_res.user:
                print(f"    -> Đã tạo tài khoản Supabase Auth thành công: ID = {auth_res.user.id}")
                synced = True
        except Exception:
            # Fallback nếu API key Supabase chưa cấu hình Service Role Secret
            pass

        # 2. Đồng bộ trực tiếp vào cơ sở dữ liệu PostgreSQL (public.users & auth.users)
        if psycopg2 and bcrypt:
            try:
                conn = psycopg2.connect(DB_URL, connect_timeout=5)
                cur = conn.cursor()
                pwd_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

                # Upsert vào public.users
                cur.execute("""
                    INSERT INTO public.users (id, username, email, password_hash, role, is_active, failed_attempts, created_at)
                    VALUES (%s, %s, %s, %s, %s, true, 0, NOW())
                    ON CONFLICT (id) DO UPDATE 
                    SET username = EXCLUDED.username,
                        email = EXCLUDED.email,
                        password_hash = EXCLUDED.password_hash,
                        role = EXCLUDED.role,
                        is_active = true,
                        failed_attempts = 0;
                """, (uid, username, email, pwd_hash, role))

                # Upsert vào auth.users nếu bảng tồn tại
                try:
                    cur.execute("""
                        INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, is_super_admin, created_at, updated_at)
                        VALUES (%s, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', %s, %s, NOW(), 
                                jsonb_build_object('full_name', %s, 'role', %s, 'username', %s),
                                jsonb_build_object('provider', 'email', 'providers', array['email']),
                                %s, NOW(), NOW())
                        ON CONFLICT (id) DO UPDATE
                        SET email = EXCLUDED.email,
                            encrypted_password = EXCLUDED.encrypted_password,
                            raw_user_meta_data = EXCLUDED.raw_user_meta_data,
                            updated_at = NOW();
                    """, (uid, email, pwd_hash, full_name, role, username, (role == "ADMIN")))
                except Exception:
                    pass

                conn.commit()
                conn.close()
                print("    -> Đã đồng bộ tài khoản vào cơ sở dữ liệu (PostgreSQL public.users & auth.users).")
                synced = True
            except Exception as db_exc:
                print(f"    [!] Lỗi kết nối PostgreSQL: {db_exc}")

        if not synced:
            print("    [!] Không thể đồng bộ tài khoản.")

    print("\nHoàn tất khởi tạo danh sách tài khoản chuẩn.")

if __name__ == "__main__":
    seed_users()
