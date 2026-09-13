import axios from "axios";

const API = "http://localhost:3000";

const apiClient = axios.create({
  baseURL: API,
});

apiClient.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => Promise.reject(error),
);

export default apiClient;