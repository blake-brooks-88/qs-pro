import axios from "axios";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "sonner";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const { user, tenant, logout } = useAuthStore.getState();

      if (user && tenant) {
        try {
          // Attempt silent refresh
          await axios.get("/auth/refresh", { baseURL: "/api" });

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
