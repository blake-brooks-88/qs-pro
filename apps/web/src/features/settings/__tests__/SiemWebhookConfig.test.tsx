import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
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

    it("clears URL validation error after the URL is edited", async () => {
      setupAuth();
      setupNoConfigHandler();

      renderWithProviders(<SiemWebhookConfig />);

      const urlInput = await screen.findByPlaceholderText(
        "https://your-siem-endpoint.com/webhook",
      );
      const secretInput = screen.getByPlaceholderText("Minimum 16 characters");

      await userEvent.type(urlInput, "http://insecure.com/webhook");
      await userEvent.type(secretInput, "a-secret-that-is-long-enough");

      await userEvent.click(
        screen.getByRole("button", { name: "Save Configuration" }),
      );

      expect(
        screen.getByText("Webhook URL must use HTTPS"),
      ).toBeInTheDocument();

      await userEvent.clear(urlInput);
      await userEvent.type(urlInput, "https://secure.example.com/webhook");

      expect(
        screen.queryByText("Webhook URL must use HTTPS"),
      ).not.toBeInTheDocument();
    });

    it("enables save once the secret reaches 16 characters", async () => {
      setupAuth();
      setupNoConfigHandler();

      renderWithProviders(<SiemWebhookConfig />);

      const urlInput = await screen.findByPlaceholderText(
        "https://your-siem-endpoint.com/webhook",
      );
      const secretInput = screen.getByPlaceholderText("Minimum 16 characters");

      await userEvent.type(urlInput, "https://secure.example.com/webhook");
      await userEvent.type(secretInput, "short");

      const saveBtn = screen.getByRole("button", {
        name: "Save Configuration",
      });
      expect(saveBtn).toBeDisabled();

      await userEvent.type(secretInput, "a-secret-that-is-long-enough");

      expect(saveBtn).toBeEnabled();
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

    it("confirming delete fires delete mutation", async () => {
      setupAuth();
      setupConfigHandler();

      const deleteHandler = vi.fn();
      server.use(
        http.delete("/api/admin/siem/config", () => {
          deleteHandler();
          return HttpResponse.json({});
        }),
      );

      renderWithProviders(<SiemWebhookConfig />);

      const deleteBtn = await screen.findByRole("button", { name: /Delete/ });
      await userEvent.click(deleteBtn);

      const dialog = screen.getByRole("dialog");
      const confirmDeleteBtn = within(dialog).getByRole("button", {
        name: /^Delete$/,
      });
      await userEvent.click(confirmDeleteBtn);

      await vi.waitFor(() => {
        expect(deleteHandler).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("update configuration button fires upsert mutation", async () => {
      setupAuth();
      setupConfigHandler();

      const upsertHandler = vi.fn();
      server.use(
        http.put("/api/admin/siem/config", async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          upsertHandler(body);
          return HttpResponse.json(mockConfig);
        }),
      );

      renderWithProviders(<SiemWebhookConfig />);

      await screen.findByRole("button", { name: "Test Webhook" });

      const updateBtn = screen.getByRole("button", {
        name: /Update Configuration/,
      });
      await userEvent.click(updateBtn);

      await vi.waitFor(() => {
        expect(upsertHandler).toHaveBeenCalled();
      });
    });

    it("shows and clears URL validation error when updating configuration", async () => {
      setupAuth();
      setupConfigHandler();

      renderWithProviders(<SiemWebhookConfig />);

      const urlInput = await screen.findByPlaceholderText(
        "https://your-siem-endpoint.com/webhook",
      );

      await userEvent.clear(urlInput);
      await userEvent.type(urlInput, "http://insecure.example.com/webhook");

      await userEvent.click(
        screen.getByRole("button", { name: "Update Configuration" }),
      );

      expect(
        screen.getByText("Webhook URL must use HTTPS"),
      ).toBeInTheDocument();

      await userEvent.clear(urlInput);
      await userEvent.type(urlInput, "https://secure.example.com/webhook");

      expect(
        screen.queryByText("Webhook URL must use HTTPS"),
      ).not.toBeInTheDocument();
    });

    it("renders a 'Never' last success label when no success timestamp exists", async () => {
      setupAuth();
      setupConfigHandler({ ...mockConfig, lastSuccessAt: null });

      renderWithProviders(<SiemWebhookConfig />);

      expect(
        await screen.findByText(/Last success:\s*Never/i),
      ).toBeInTheDocument();
    });

    it("renders a relative minute label for last success time within the hour", async () => {
      const nowSpy = vi
        .spyOn(Date, "now")
        .mockReturnValue(new Date("2026-03-01T00:10:00.000Z").getTime());
      try {
        setupAuth();
        setupConfigHandler({
          ...mockConfig,
          lastSuccessAt: "2026-03-01T00:05:00.000Z",
        });

        renderWithProviders(<SiemWebhookConfig />);

        expect(
          await screen.findByText(/Last success:\s*5 min ago/i),
        ).toBeInTheDocument();
      } finally {
        nowSpy.mockRestore();
      }
    });
  });

  describe("Setup mode validation", () => {
    it("save button is disabled when secret is shorter than 16 characters", async () => {
      setupAuth();
      setupNoConfigHandler();

      renderWithProviders(<SiemWebhookConfig />);

      const urlInput = await screen.findByPlaceholderText(
        "https://your-siem-endpoint.com/webhook",
      );
      const secretInput = screen.getByPlaceholderText("Minimum 16 characters");

      await userEvent.type(urlInput, "https://example.com/hook");
      await userEvent.type(secretInput, "short");

      const saveBtn = screen.getByRole("button", {
        name: /Save Configuration/,
      });
      expect(saveBtn).toBeDisabled();
    });
  });
});
