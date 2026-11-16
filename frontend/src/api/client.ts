import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Interceptor tự động gắn JWT Token vào mọi Request
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('fire_alert_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor xử lý phản hồi tập trung (chuẩn hóa dữ liệu giữa FastAPI và Gateway)
apiClient.interceptors.response.use(
  (response) => {
    // Nếu backend trả về mảng thô hoặc object thô (chuẩn FastAPI), bọc vào format { success: true, data: ... }
    if (
      response.data !== null &&
      response.data !== undefined &&
      typeof response.data === 'object' &&
      !('data' in response.data) &&
      !('success' in response.data)
    ) {
      response.data = {
        success: true,
        data: response.data,
      };
    }
    return response;
  },
  (error) => {
    const token = localStorage.getItem('fire_alert_token');
    // Không tự động đăng xuất nếu đang sử dụng tài khoản Demo hoặc backend chưa kích hoạt Supabase Auth
    const isDemoToken = !token || token.startsWith('demo_token_');
    if (error.response?.status === 401 && !isDemoToken) {
      localStorage.removeItem('fire_alert_token');
      localStorage.removeItem('fire_alert_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
