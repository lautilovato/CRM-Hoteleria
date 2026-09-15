import axios, { AxiosError } from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string | string[] }>) => {
    const data = error.response?.data;
    const detail = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;

    // Nest devuelve el detalle en `message`; lo dejamos en error.message para no
    // tener que desarmar la respuesta en cada pantalla.
    if (detail) error.message = detail;

    return Promise.reject(error);
  },
);

export default apiClient;
