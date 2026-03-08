import { vi } from "vitest";

export const mockToast = {
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
};

vi.mock("sonner", () => ({ toast: mockToast, Toaster: () => null }));
