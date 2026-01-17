import axios, {
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { toast } from "sonner";

import { useAuthStore } from "@/store/auth-store";

type RetriableRequestConfig = AxiosRequestConfig & { _retry?: boolean };

const MUTATING_METHODS = ["post", "put", "patch", "delete"];

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const method = config.method?.toLowerCase();

  if (method && MUTATING_METHODS.includes(method)) {
    const csrfToken = useAuthStore.getState().csrfToken;

    if (csrfToken && config.headers?.set) {
      config.headers.set("x-csrf-token", csrfToken);
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      const { user, tenant, logout } = useAuthStore.getState();

      if (user && tenant) {
        try {
          await api.get("/auth/refresh", {
            _retry: true,
          } as RetriableRequestConfig);

          return api(originalRequest);
        } catch (refreshError) {
          logout();
          toast.error("Session expired. Please log in again.");
          return Promise.reject(refreshError);
        }
      }
    }

    if (
      error.response?.data?.code === "SEAT_LIMIT_EXCEEDED" ||
      error.response?.data?.error === "SEAT_LIMIT_EXCEEDED"
    ) {
      toast.error("Your organization has reached its seat limit");
    }

    return Promise.reject(error);
  },
);

export default api;
