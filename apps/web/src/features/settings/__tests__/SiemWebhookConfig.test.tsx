import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import type { SiemConfigResponse } from "@/services/siem-api";
import { useAuthStore } from "@/store/auth-store";
import { server } from "@/test/mocks/server";
import { createTenantStub, createUserStub } from "@/test/stubs";

import { SiemWebhookConfig } from "../components/SiemWebhookConfig";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  return {
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
    queryClient,
  };
}

function setupAuth() {
  useAuthStore.setState({
    user: createUserStub({ role: "admin" }),
    tenant: createTenantStub(),
    csrfToken: "csrf",
  });
}

const mockConfig: SiemConfigResponse = {
  id: "siem-1",
  webhookUrl: "https://siem.example.com/webhook",
  enabled: true,
  consecutiveFailures: 0,
  lastSuccessAt: new Date().toISOString(),
  lastFailureAt: null,
  lastFailureReason: null,
  disabledAt: null,
  disabledReason: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: new Date().toISOString(),
};

function setupNoConfigHandler() {
  server.use(
    http.get("/api/admin/siem/config", () => {
      return new HttpResponse(null, { status: 404 });
    }),
  );
}

function setupConfigHandler(config: SiemConfigResponse = mockConfig) {
  server.use(
    http.get("/api/admin/siem/config", () => {
      return HttpResponse.json(config);
    }),
  );
}

describe("SiemWebhookConfig", () => {
  describe("Setup mode (no config)", () => {
    it("shows URL and secret inputs when no config exists", async () => {
      setupAuth();
      setupNoConfigHandler();

      renderWithProviders(<SiemWebhookConfig />);

      expect(
        await screen.findByPlaceholderText(
          "https://your-siem-endpoint.com/webhook",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Minimum 16 characters"),
      ).toBeInTheDocument();
    });

    it("validates URL must be HTTPS", async () => {
      setupAuth();
      setupNoConfigHandler();

      renderWithProviders(<SiemWebhookConfig />);

      const urlInput = await screen.findByPlaceholderText(
        "https://your-siem-endpoint.com/webhook",
      );
      const secretInput = screen.getByPlaceholderText("Minimum 16 characters");

      await userEvent.type(urlInput, "http://insecure.com/webhook");
      await userEvent.type(secretInput, "a-secret-that-is-long-enough");

      const saveBtn = screen.getByRole("button", {
        name: "Save Configuration",
      });
      await userEvent.click(saveBtn);

      expect(
        screen.getByText("Webhook URL must use HTTPS"),
      ).toBeInTheDocument();
    });

    it("save button calls upsert mutation", async () => {
      setupAuth();
      setupNoConfigHandler();

      const upsertHandler = vi.fn();
      server.use(
        http.put("/api/admin/siem/config", async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          upsertHandler(body);
          return HttpResponse.json(mockConfig);
        }),
      );

      renderWithProviders(<SiemWebhookConfig />);

      const urlInput = await screen.findByPlaceholderText(
        "https://your-siem-endpoint.com/webhook",
      );
      const secretInput = screen.getByPlaceholderText("Minimum 16 characters");

      await userEvent.type(urlInput, "https://siem.example.com/webhook");
      await userEvent.type(secretInput, "super-secret-key-1234");

      const saveBtn = screen.getByRole("button", {
        name: "Save Configuration",
      });
      await userEvent.click(saveBtn);

      await vi.waitFor(() => {
        expect(upsertHandler).toHaveBeenCalledWith({
          webhookUrl: "https://siem.example.com/webhook",
          secret: "super-secret-key-1234",
        });
      });
    });
  });

  describe("Management mode (config exists)", () => {
    it("shows webhook URL and status indicators", async () => {
      setupAuth();
      setupConfigHandler();

      renderWithProviders(<SiemWebhookConfig />);

      expect(await screen.findByText("Active")).toBeInTheDocument();
      expect(screen.getByText(/Last success:/)).toBeInTheDocument();
      expect(screen.getByText(/Failures: 0/)).toBeInTheDocument();
    });

    it("test button fires test mutation", async () => {
      setupAuth();
      setupConfigHandler();

      const testHandler = vi.fn();
      server.use(
        http.post("/api/admin/siem/test", () => {
          testHandler();
          return HttpResponse.json({ success: true, statusCode: 200 });
        }),
      );

      renderWithProviders(<SiemWebhookConfig />);

      const testBtn = await screen.findByRole("button", {
        name: "Test Webhook",
      });
      await userEvent.click(testBtn);

      await vi.waitFor(() => {
        expect(testHandler).toHaveBeenCalled();
      });
    });

    it("test success shows connected message", async () => {
      setupAuth();
      setupConfigHandler();

      server.use(
        http.post("/api/admin/siem/test", () => {
          return HttpResponse.json({ success: true, statusCode: 200 });
        }),
      );

      renderWithProviders(<SiemWebhookConfig />);

      const testBtn = await screen.findByRole("button", {
        name: "Test Webhook",
      });
      await userEvent.click(testBtn);

      expect(await screen.findByText("Connected (200)")).toBeInTheDocument();
    });

    it("test failure shows error message", async () => {
      setupAuth();
      setupConfigHandler();

      server.use(
        http.post("/api/admin/siem/test", () => {
          return HttpResponse.json({
            success: false,
            error: "Connection timed out",
          });
        }),
      );

      renderWithProviders(<SiemWebhookConfig />);

      const testBtn = await screen.findByRole("button", {
        name: "Test Webhook",
      });
      await userEvent.click(testBtn);

      expect(
        await screen.findByText("Connection timed out"),
      ).toBeInTheDocument();
    });

    it("delete button shows confirmation dialog", async () => {
      setupAuth();
      setupConfigHandler();

      renderWithProviders(<SiemWebhookConfig />);

      const deleteBtn = await screen.findByRole("button", { name: /Delete/ });
      await userEvent.click(deleteBtn);

      expect(screen.getByText("Delete SIEM Configuration")).toBeInTheDocument();
      expect(
        screen.getByText(/This will disable the webhook/),
      ).toBeInTheDocument();
    });

    it("shows degraded badge when failures exist", async () => {
      setupAuth();
      setupConfigHandler({
        ...mockConfig,
        consecutiveFailures: 3,
        lastFailureAt: new Date().toISOString(),
        lastFailureReason: "Connection refused",
      });

      renderWithProviders(<SiemWebhookConfig />);

      expect(await screen.findByText("Degraded")).toBeInTheDocument();
      expect(screen.getByText(/Failures: 3/)).toBeInTheDocument();
    });

    it("shows disabled state with reason and warning banner", async () => {
      setupAuth();
      setupConfigHandler({
        ...mockConfig,
        enabled: false,
        disabledAt: new Date().toISOString(),
        disabledReason: "Too many consecutive failures",
        consecutiveFailures: 10,
      });

      renderWithProviders(<SiemWebhookConfig />);

      expect(await screen.findByText("Disabled")).toBeInTheDocument();
      expect(
        screen.getByText(/Too many consecutive failures/),
      ).toBeInTheDocument();
    });
  });
});
