import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const responseUseMock = vi.fn();
  const client = {
    interceptors: {
      response: {
        use: responseUseMock,
      },
    },
  };
  return {
    client,
    responseUseMock,
    createMock: vi.fn(() => client),
    isAxiosErrorMock: vi.fn(),
  };
});

vi.mock("axios", () => ({
  default: {
    create: mocks.createMock,
    isAxiosError: mocks.isAxiosErrorMock,
  },
}));

describe("api", () => {
  it("registers a 401 interceptor that redirects to /login", async () => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });

    mocks.isAxiosErrorMock.mockReturnValue(true);
    const mod = await import("./api");
    expect(mod.api).toBe(mocks.client);

    const onRejected = mocks.responseUseMock.mock.calls[0]?.[1] as
      | ((err: unknown) => unknown)
      | undefined;
    expect(onRejected).toBeTypeOf("function");

    await expect(
      Promise.resolve(
        onRejected?.({ response: { status: 401 } } as unknown),
      ),
    ).rejects.toBeDefined();
    expect(window.location.href).toBe("/login");

    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });
});

