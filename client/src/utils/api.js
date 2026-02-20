import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_SERVER_URL
    ? `${process.env.REACT_APP_SERVER_URL}/api`
    : '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('cc_token');
      localStorage.removeItem('cc_user');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export default api;
