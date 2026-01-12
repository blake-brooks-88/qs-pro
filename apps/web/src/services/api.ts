import axios, { type AxiosRequestConfig } from "axios";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "sonner";

type RetriableRequestConfig = AxiosRequestConfig & { _retry?: boolean };

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
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
          // Attempt silent refresh
          await api.get("/auth/refresh", {
            _retry: true,
          } as RetriableRequestConfig);

          // Retry the original request
          return api(originalRequest);
        } catch (refreshError) {
          logout();
          toast.error("Session expired. Please log in again.");
          return Promise.reject(refreshError);
        }
      }
    }

    // Handle SEAT_LIMIT_EXCEEDED error
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
