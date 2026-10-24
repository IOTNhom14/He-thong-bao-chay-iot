from supabase import create_client, Client
from app.core.config import settings

# Khởi tạo Supabase Client sử dụng SERVICE_ROLE_KEY để backend có toàn quyền quản trị (Bypass RLS)
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
