import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import type { MemberListItem } from "@/services/admin-api";
import { useAuthStore } from "@/store/auth-store";
import { server } from "@/test/mocks/server";
import { createTenantStub, createUserStub } from "@/test/stubs";

import { MembersTab } from "../components/MembersTab";

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

const mockMembers: MemberListItem[] = [
  {
    id: "user-1",
    name: "Alice Owner",
    email: "alice@example.com",
    role: "owner",
    lastActiveAt: new Date().toISOString(),
    joinedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "user-2",
    name: "Bob Admin",
    email: "bob@example.com",
    role: "admin",
    lastActiveAt: new Date().toISOString(),
    joinedAt: "2024-02-01T00:00:00Z",
  },
  {
    id: "user-3",
    name: "Carol Member",
    email: "carol@example.com",
    role: "member",
    lastActiveAt: null,
    joinedAt: "2024-03-01T00:00:00Z",
  },
];

function setupMockAuth(role: "owner" | "admin" | "member" = "owner") {
  useAuthStore.setState({
    user: createUserStub({ role }),
    tenant: createTenantStub(),
    csrfToken: "csrf",
  });
}

function setupMembersHandler(members: MemberListItem[] = mockMembers) {
  server.use(
    http.get("/api/admin/members", () => {
      return HttpResponse.json({ members });
    }),
  );
}

describe("MembersTab", () => {
  it("renders member list with correct columns", async () => {
    setupMockAuth("owner");
    setupMembersHandler();

    renderWithProviders(<MembersTab />);

    expect(await screen.findByText("Alice Owner")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByText("Carol Member")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
  });

  it("filters members by name", async () => {
    setupMockAuth("owner");
    setupMembersHandler();

    renderWithProviders(<MembersTab />);

    await screen.findByText("Alice Owner");

    const searchInput = screen.getByPlaceholderText("Search members...");
    await userEvent.type(searchInput, "Bob");

    expect(screen.getByText("Bob Admin")).toBeInTheDocument();
    expect(screen.queryByText("Alice Owner")).not.toBeInTheDocument();
    expect(screen.queryByText("Carol Member")).not.toBeInTheDocument();
  });

  it("filters members by email", async () => {
    setupMockAuth("owner");
    setupMembersHandler();

    renderWithProviders(<MembersTab />);

    await screen.findByText("Alice Owner");

    const searchInput = screen.getByPlaceholderText("Search members...");
    await userEvent.type(searchInput, "carol@");

    expect(screen.getByText("Carol Member")).toBeInTheDocument();
    expect(screen.queryByText("Alice Owner")).not.toBeInTheDocument();
  });

  it("shows Owner as static text for owner row", async () => {
    setupMockAuth("owner");
    setupMembersHandler();

    renderWithProviders(<MembersTab />);

    await screen.findByText("Alice Owner");

    const ownerRow = screen
      .getByText("Alice Owner")
      .closest("tr") as HTMLElement;
    expect(within(ownerRow).getByText("Owner")).toBeInTheDocument();
  });

  it("shows role dropdown for non-owner members", async () => {
    setupMockAuth("owner");
    setupMembersHandler();

    renderWithProviders(<MembersTab />);

    await screen.findByText("Bob Admin");

    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);
  });

  it("fires mutation when role is changed", async () => {
    setupMockAuth("owner");
    setupMembersHandler();

    const rolePatchHandler = vi.fn();
    server.use(
      http.patch("/api/admin/members/:userId/role", async ({ request }) => {
        const body = (await request.json()) as { role: string };
        rolePatchHandler(body);
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(<MembersTab />);

    await screen.findByText("Carol Member");

    const carolRow = screen
      .getByText("Carol Member")
      .closest("tr") as HTMLElement;
    const select = within(carolRow).getByRole("combobox");
    await userEvent.selectOptions(select, "admin");

    await vi.waitFor(() => {
      expect(rolePatchHandler).toHaveBeenCalledWith({ role: "admin" });
    });
  });

  it("shows Transfer Ownership button only for owner actors", async () => {
    setupMockAuth("owner");
    setupMembersHandler();

    renderWithProviders(<MembersTab />);

    await screen.findByText("Bob Admin");

    const buttons = screen.getAllByRole("button", {
      name: "Transfer Ownership",
    });
    expect(buttons).toHaveLength(2);
  });

  it("hides Transfer Ownership button for admin actors", async () => {
    setupMockAuth("admin");
    setupMembersHandler();

    renderWithProviders(<MembersTab />);

    await screen.findByText("Bob Admin");

    expect(
      screen.queryByRole("button", { name: "Transfer Ownership" }),
    ).not.toBeInTheDocument();
  });

  it("shows confirmation dialog on Transfer Ownership click", async () => {
    setupMockAuth("owner");
    setupMembersHandler();

    renderWithProviders(<MembersTab />);

    await screen.findByText("Bob Admin");

    const bobRow = screen.getByText("Bob Admin").closest("tr") as HTMLElement;
    const transferBtn = within(bobRow).getByRole("button", {
      name: "Transfer Ownership",
    });
    await userEvent.click(transferBtn);

    expect(screen.getByText(/Transfer ownership to/)).toBeInTheDocument();
  });

  it("shows empty state when no members", async () => {
    setupMockAuth("owner");
    setupMembersHandler([]);

    renderWithProviders(<MembersTab />);

    expect(await screen.findByText("No members found")).toBeInTheDocument();
  });

  it("confirms transfer ownership and fires mutation", async () => {
    setupMockAuth("owner");
    setupMembersHandler();

    const transferHandler = vi.fn();
    server.use(
      http.post("/api/admin/transfer-ownership", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        transferHandler(body);
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(<MembersTab />);
    await screen.findByText("Bob Admin");

    const bobRow = screen.getByText("Bob Admin").closest("tr") as HTMLElement;
    const transferBtn = within(bobRow).getByRole("button", {
      name: "Transfer Ownership",
    });
    await userEvent.click(transferBtn);

    const dialog = screen.getByRole("dialog");
    const confirmBtn = within(dialog).getByRole("button", {
      name: /Transfer Ownership/,
    });
    await userEvent.click(confirmBtn);

    await vi.waitFor(() => {
      expect(transferHandler).toHaveBeenCalledWith({ newOwnerId: "user-2" });
    });
  });

  it("renders relative minute label for recent lastActiveAt values", async () => {
    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-03-01T00:10:00.000Z").getTime());
    try {
      setupMockAuth("owner");
      setupMembersHandler([
        {
          id: "user-1",
          name: "Alice Owner",
          email: "alice@example.com",
          role: "owner",
          lastActiveAt: "2026-03-01T00:05:00.000Z",
          joinedAt: "2024-01-01T00:00:00Z",
        },
      ]);

      renderWithProviders(<MembersTab />);

      expect(await screen.findByText("Alice Owner")).toBeInTheDocument();
      expect(screen.getByText("5 min ago")).toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("closes the transfer ownership dialog on Escape", async () => {
    setupMockAuth("owner");
    setupMembersHandler();

    renderWithProviders(<MembersTab />);

    await screen.findByText("Bob Admin");

    const bobRow = screen.getByText("Bob Admin").closest("tr") as HTMLElement;
    await userEvent.click(
      within(bobRow).getByRole("button", { name: "Transfer Ownership" }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("shows a pending state while transferring ownership", async () => {
    setupMockAuth("owner");
    setupMembersHandler();

    let resolveRequest: (() => void) | undefined;
    server.use(
      http.post("/api/admin/transfer-ownership", async ({ request }) => {
        await new Promise<void>((resolve) => {
          resolveRequest = resolve;
        });
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(body);
      }),
    );

    renderWithProviders(<MembersTab />);
    await screen.findByText("Bob Admin");

    const bobRow = screen.getByText("Bob Admin").closest("tr") as HTMLElement;
    await userEvent.click(
      within(bobRow).getByRole("button", { name: "Transfer Ownership" }),
    );

    const dialog = screen.getByRole("dialog");
    const confirmBtn = within(dialog).getByRole("button", {
      name: "Transfer Ownership",
    });
    await userEvent.click(confirmBtn);

    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Transferring...",
      }),
    ).toBeInTheDocument();

    resolveRequest?.();

    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
