-- ==============================================================================
-- DU LIEU KHOI TAO MAU (SEED DATA CHO DE AN NHOM 14)
-- ==============================================================================

-- 1. TAO THIET BI MAU BAN DAU
INSERT INTO public.devices (
    device_id,
    name,
    location,
    auth_token,
    status,
    smoke_threshold,
    temp_threshold,
    firmware_version
) VALUES 
(
    'ESP32_FIRE_001',
    'Node Báo Cháy Phòng Khách',
    'Tầng 1 - Phòng Khách',
    'tok_esp32_livingroom_prod_7f8a9b',
    'ACTIVE',
    400.0,
    55.0,
    'v1.0.0'
),
(
    'ESP32_FIRE_002',
    'Node Báo Cháy Nhà Bếp',
    'Tầng 1 - Khu Vực Bếp Gas',
    'tok_esp32_kitchen_prod_3c4d5e',
    'ACTIVE',
    450.0,
    60.0,
    'v1.0.0'
)
ON CONFLICT (device_id) DO NOTHING;
