import axios from 'axios';

export const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// 请求拦截：附带 JWT
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：401 统一登出
http.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      if (location.pathname !== '/login') {
        location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
