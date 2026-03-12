import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuthClientMock: vi.fn(() => ({ signOut: vi.fn() })),
  adminClientMock: vi.fn(() => ({ plugin: "admin" })),
  twoFactorClientMock: vi.fn((opts: unknown) => ({ plugin: "2fa", opts })),
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: mocks.createAuthClientMock,
}));

vi.mock("better-auth/client/plugins", () => ({
  adminClient: mocks.adminClientMock,
  twoFactorClient: mocks.twoFactorClientMock,
}));

describe("authClient", () => {
  it("configures Better Auth client plugins and redirect handler", async () => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });

    await import("./auth-client");

    expect(mocks.createAuthClientMock).toHaveBeenCalledTimes(1);
    const args = mocks.createAuthClientMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(args.baseURL).toBeTypeOf("string");
    expect(Array.isArray(args.plugins)).toBe(true);

    const pluginArgs = mocks.twoFactorClientMock.mock.calls[0]?.[0] as
      | { onTwoFactorRedirect?: () => void }
      | undefined;

    pluginArgs?.onTwoFactorRedirect?.();
    expect(window.location.href).toBe("/2fa");

    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });
});
