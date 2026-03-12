import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useBackofficeUsers,
  useBanUser,
  useChangeUserRole,
  useDeleteUser,
  useInviteUser,
  useResetPassword,
  useUnbanUser,
} from "./use-backoffice-users";

const mocks = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  patchMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: mocks.getMock,
    post: mocks.postMock,
    patch: mocks.patchMock,
  },
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("backoffice user hooks", () => {
  it("fetches backoffice users", async () => {
    mocks.getMock.mockResolvedValueOnce({ data: { users: [], total: 0 } });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useBackofficeUsers(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mocks.getMock).toHaveBeenCalledWith("/settings/users");
  });

  it("invalidates after mutations", async () => {
    mocks.postMock.mockResolvedValue({ data: {} });
    mocks.patchMock.mockResolvedValue({ data: {} });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const invite = renderHook(() => useInviteUser(), {
      wrapper: createWrapper(queryClient),
    });
    await invite.result.current.mutateAsync({
      email: "a@b.com",
      name: "A",
      role: "viewer",
      temporaryPassword: "ValidPassword123456",
    });

    const role = renderHook(() => useChangeUserRole(), {
      wrapper: createWrapper(queryClient),
    });
    await role.result.current.mutateAsync({ userId: "u1", role: "admin" });

    const ban = renderHook(() => useBanUser(), { wrapper: createWrapper(queryClient) });
    await ban.result.current.mutateAsync({ userId: "u1" });

    const unban = renderHook(() => useUnbanUser(), { wrapper: createWrapper(queryClient) });
    await unban.result.current.mutateAsync({ userId: "u1" });

    const reset = renderHook(() => useResetPassword(), { wrapper: createWrapper(queryClient) });
    await reset.result.current.mutateAsync({ userId: "u1", newPassword: "ValidPassword123456" });

    const del = renderHook(() => useDeleteUser(), { wrapper: createWrapper(queryClient) });
    await del.result.current.mutateAsync({ userId: "u1" });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["backoffice-users"] });
  });
});

