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
    targetId: null,
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
    targetId: "sq-1",
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

  it("date range preset buttons update active state", async () => {
    setupAuth();
    setupAuditHandler();
    setupSiemHandler();

    renderWithProviders(<AuditLogTab />);

    await screen.findByText("192.168.1.1");

    const btn7d = screen.getByRole("button", { name: "7d" });
    await userEvent.click(btn7d);

    expect(btn7d.className).toContain("bg-primary");
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
        return new Promise(() => {
          /* never resolves to keep loading state */
        });
      }),
    );

    renderWithProviders(<AuditLogTab />);

    const skeletonElements = document.querySelectorAll(".animate-pulse");
    expect(skeletonElements.length).toBeGreaterThan(0);
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
});
