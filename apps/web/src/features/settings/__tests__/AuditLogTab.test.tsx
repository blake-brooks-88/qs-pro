import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/store/auth-store";
import { server } from "@/test/mocks/server";
import { createTenantStub, createUserStub } from "@/test/stubs";

import { AuditLogTab } from "../components/AuditLogTab";

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

const mockAuditItems = [
  {
    id: "log-1",
    tenantId: "tenant-1",
    mid: "12345",
    eventType: "auth.login",
    actorType: "user" as const,
    actorId: "user-1",
    actorName: "Alice Smith",
    actorEmail: "alice@example.com",
    targetId: null,
    targetName: null,
    targetEmail: null,
    metadata: null,
    ipAddress: "192.168.1.1",
    userAgent: "Mozilla/5.0",
    createdAt: "2024-06-15T10:30:00Z",
  },
  {
    id: "log-2",
    tenantId: "tenant-1",
    mid: "12345",
    eventType: "saved_query.created",
    actorType: "user" as const,
    actorId: "user-2",
    actorName: "Bob Jones",
    actorEmail: "bob@example.com",
    targetId: "sq-1",
    targetName: null,
    targetEmail: null,
    metadata: null,
    ipAddress: "10.0.0.1",
    userAgent: "Mozilla/5.0",
    createdAt: "2024-06-15T11:00:00Z",
  },
];

function setupAuth() {
  useAuthStore.setState({
    user: createUserStub({ role: "admin" }),
    tenant: createTenantStub(),
    csrfToken: "csrf",
  });
}

function setupAuditHandler(items = mockAuditItems, total?: number) {
  server.use(
    http.get("/api/audit-logs", () => {
      return HttpResponse.json({
        items,
        total: total ?? items.length,
        page: 1,
        pageSize: 25,
      });
    }),
  );
}

function setupSiemHandler() {
  server.use(
    http.get("/api/admin/siem/config", () => {
      return new HttpResponse(null, { status: 404 });
    }),
  );
}

describe("AuditLogTab", () => {
  it("renders DataTable with audit log columns", async () => {
    setupAuth();
    setupAuditHandler();
    setupSiemHandler();

    renderWithProviders(<AuditLogTab />);

    expect(await screen.findByText("Timestamp")).toBeInTheDocument();
    expect(screen.getByText("Actor")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Resource")).toBeInTheDocument();
    expect(screen.getByText("IP Address")).toBeInTheDocument();
  });

  it("renders audit log data", async () => {
    setupAuth();
    setupAuditHandler();
    setupSiemHandler();

    renderWithProviders(<AuditLogTab />);

    expect(await screen.findByText("192.168.1.1")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    expect(screen.getByText("Auth > Login")).toBeInTheDocument();
    expect(screen.getByText("Saved Query > Created")).toBeInTheDocument();
  });

  it("date range preset sends date filter to API", async () => {
    setupAuth();
    setupSiemHandler();

    const dateHandler = vi.fn();
    server.use(
      http.get("/api/audit-logs", ({ request }) => {
        const url = new URL(request.url);
        dateHandler(url.searchParams.get("dateFrom"));
        return HttpResponse.json({
          items: mockAuditItems,
          total: mockAuditItems.length,
          page: 1,
          pageSize: 25,
        });
      }),
    );

    renderWithProviders(<AuditLogTab />);

    await screen.findByText("192.168.1.1");

    const btn7d = screen.getByRole("button", { name: "7d" });
    await userEvent.click(btn7d);

    await vi.waitFor(() => {
      const calls = dateHandler.mock.calls;
      const lastCall = calls[calls.length - 1] as [unknown] | undefined;
      expect(lastCall?.[0]).not.toBeNull();
    });
  });

  it("search input filters audit logs", async () => {
    setupAuth();
    setupSiemHandler();

    const searchHandler = vi.fn();
    server.use(
      http.get("/api/audit-logs", ({ request }) => {
        const url = new URL(request.url);
        const search = url.searchParams.get("search");
        searchHandler(search);
        return HttpResponse.json({
          items: mockAuditItems,
          total: mockAuditItems.length,
          page: 1,
          pageSize: 25,
        });
      }),
    );

    renderWithProviders(<AuditLogTab />);

    await screen.findByText("192.168.1.1");

    const searchInput = screen.getByPlaceholderText("Search...");
    await userEvent.type(searchInput, "login");

    await vi.waitFor(() => {
      expect(searchHandler).toHaveBeenCalledWith("login");
    });
  });

  it("shows Export CSV button", async () => {
    setupAuth();
    setupAuditHandler();
    setupSiemHandler();

    renderWithProviders(<AuditLogTab />);

    await screen.findByText("192.168.1.1");

    expect(
      screen.getByRole("button", { name: /Export CSV/ }),
    ).toBeInTheDocument();
  });

  it("shows empty state when no audit events", async () => {
    setupAuth();
    setupAuditHandler([], 0);
    setupSiemHandler();

    renderWithProviders(<AuditLogTab />);

    expect(
      await screen.findByText("No audit events found"),
    ).toBeInTheDocument();
  });

  it("shows loading skeleton", () => {
    setupAuth();
    setupSiemHandler();

    server.use(
      http.get("/api/audit-logs", () => {
        return new Promise(() => {});
      }),
    );

    renderWithProviders(<AuditLogTab />);

    expect(screen.queryByText("No audit events found")).not.toBeInTheDocument();
    expect(screen.queryByText("192.168.1.1")).not.toBeInTheDocument();
  });

  it("shows event type filter dropdown", async () => {
    setupAuth();
    setupAuditHandler();
    setupSiemHandler();

    renderWithProviders(<AuditLogTab />);

    await screen.findByText("192.168.1.1");

    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();

    const options = select.querySelectorAll("option");
    expect(options.length).toBeGreaterThan(1);
  });

  it("export CSV button triggers API call", async () => {
    setupAuth();
    setupSiemHandler();

    const exportHandler = vi.fn();
    server.use(
      http.get("/api/audit-logs", ({ request }) => {
        const url = new URL(request.url);
        const pageSize = url.searchParams.get("pageSize");
        if (pageSize === "10000") {
          exportHandler();
        }
        return HttpResponse.json({
          items: mockAuditItems,
          total: mockAuditItems.length,
          page: 1,
          pageSize: Number(pageSize) || 25,
        });
      }),
    );

    renderWithProviders(<AuditLogTab />);
    await screen.findByText("192.168.1.1");

    URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/fake");
    URL.revokeObjectURL = vi.fn();

    const exportBtn = screen.getByRole("button", { name: /Export CSV/ });
    await userEvent.click(exportBtn);

    await vi.waitFor(() => {
      expect(exportHandler).toHaveBeenCalled();
    });
  });

  it("event type filter sends eventType param to API", async () => {
    setupAuth();
    setupSiemHandler();

    const filterHandler = vi.fn();
    server.use(
      http.get("/api/audit-logs", ({ request }) => {
        const url = new URL(request.url);
        const eventType = url.searchParams.get("eventType");
        filterHandler(eventType);
        return HttpResponse.json({
          items: mockAuditItems,
          total: mockAuditItems.length,
          page: 1,
          pageSize: 25,
        });
      }),
    );

    renderWithProviders(<AuditLogTab />);
    await screen.findByText("192.168.1.1");

    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "auth");

    await vi.waitFor(() => {
      expect(filterHandler).toHaveBeenCalledWith("auth.*");
    });
  });
});
