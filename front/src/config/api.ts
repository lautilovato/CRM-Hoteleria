import axios, { AxiosError } from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
  // Sin esto el navegador descarta la cookie del refresh sin avisar: el login parece
  // andar y recién falla al recargar la página. La cookie tiene Path=/auth, así que
  // no viaja a /payment ni a /rag aunque esto sea global.
  withCredentials: true,
});

/**
 * El access token vive acá, en memoria del módulo, y nunca en localStorage: si se
 * filtra por XSS no queda nada persistido. El AuthProvider es el único que lo escribe.
 *
 * Que sea una variable de módulo y no el Context es lo que evita el ciclo de imports:
 * este archivo no sabe nada de React, y el contexto sí depende de este archivo.
 */
let accessToken: string | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

apiClient.interceptors.request.use(
  (config) => {
    // `headers` es un AxiosHeaders: se usa .set() para no pisar los defaults de la instancia.
    if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`);

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
