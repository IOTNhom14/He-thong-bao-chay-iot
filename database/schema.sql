-- ==============================================================================
-- HE THONG CANH BAO CHAY THONG MINH IOT (NHOM 14 - IOT VA UNG DUNG)
-- DATABASE SCHEMA DEFINITION (POSTGRESQL / SUPABASE)
-- ==============================================================================

-- 1. BANG NGUOI DUNG VA PHAN QUYEN (RBAC)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'VIEWER' CHECK (role IN ('ADMIN', 'OPERATOR', 'VIEWER')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. BANG QUAN LY THIET BI VA VONG DOI (DEVICE LIFECYCLE)
CREATE TABLE IF NOT EXISTS public.devices (
    device_id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    auth_token VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'REGISTERED' 
        CHECK (status IN ('REGISTERED', 'PROVISIONED', 'ACTIVE', 'OFFLINE', 'MAINTENANCE', 'DECOMMISSIONED')),
    smoke_threshold DOUBLE PRECISION NOT NULL DEFAULT 400.0,
    temp_threshold DOUBLE PRECISION NOT NULL DEFAULT 55.0,
    camera_url VARCHAR(255), -- URL Camera snapshot riêng gán cho từng thiết bị
    firmware_version VARCHAR(50) DEFAULT 'v1.0.0',
    assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. BANG DU LIEU CAM BIEN TELEMETRY (TIME-SERIES DATA)
CREATE TABLE IF NOT EXISTS public.telemetry (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
    gas_ppm DOUBLE PRECISION NOT NULL,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    flame_detected BOOLEAN NOT NULL DEFAULT FALSE,
    local_alarm BOOLEAN NOT NULL DEFAULT FALSE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index ho tro truy van telemetry theo thiet bi va thoi gian nhanh chong
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON public.telemetry (device_id, timestamp DESC);

-- 4. BANG LICH SU CANH BAO (ALERTS & EVENTS)
CREATE TABLE IF NOT EXISTS public.alerts (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
    alert_type VARCHAR(100) NOT NULL CHECK (alert_type IN ('FIRE_EMERGENCY', 'SMOKE_WARNING', 'HIGH_TEMP_WARNING', 'DEVICE_OFFLINE')),
    trigger_value DOUBLE PRECISION DEFAULT 0.0,
    threshold_value DOUBLE PRECISION DEFAULT 0.0,
    status VARCHAR(50) NOT NULL DEFAULT 'TRIGGERED' CHECK (status IN ('TRIGGERED', 'ACKNOWLEDGED', 'RESOLVED')),
    acknowledged_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_triggered_at ON public.alerts (triggered_at DESC);

-- 5. BANG LICH SU LENH DIEU KHIEN CO CAU CHAP HANH (COMMAND LOGS & ACK)
CREATE TABLE IF NOT EXISTS public.command_logs (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    parameters JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT', 'ACKNOWLEDGED', 'FAILED', 'TIMEOUT')),
    initiated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. BANG AUDIT LOG LUU VET THAO TAC BAO MAT (SECURITY AUDIT)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    action VARCHAR(255) NOT NULL,
    ip_address VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- 7. TRIGGER DONG BO TU DONG SUPABASE AUTH SANG PUBLIC.USERS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, username, email, full_name, role, is_active)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'VIEWER'),
        TRUE
    )
    ON CONFLICT (id) DO UPDATE SET
        username = COALESCE(EXCLUDED.username, public.users.username),
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
        role = COALESCE(EXCLUDED.role, public.users.role);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

