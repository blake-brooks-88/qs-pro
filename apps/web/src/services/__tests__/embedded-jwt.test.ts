import { beforeEach, describe, expect, it, vi } from "vitest";

const makeMockWindow = (options: { embedded: boolean }) => {
  const win = new EventTarget() as unknown as Window;
  const self = {};
  const top = options.embedded ? {} : self;
  const parent = options.embedded ? {} : self;

  Object.assign(win as unknown as Record<string, unknown>, {
    self,
    top,
    parent,
  });
  return { win, self, top, parent };
};

const dispatchMessage = (
  win: Window,
  params: { origin: string; data: unknown; source: unknown },
) => {
  const event = new MessageEvent("message", {
    data: params.data,
    origin: params.origin,
  });
  Object.defineProperty(event, "source", { value: params.source });
  win.dispatchEvent(event);
};

describe("embedded JWT", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does not buffer JWT when not in an iframe", async () => {
    const { startEmbeddedJwtListener, consumeEmbeddedJwt } =
      await import("../embedded-jwt");

    const { win, parent } = makeMockWindow({ embedded: false });
    startEmbeddedJwtListener(win);

    dispatchMessage(win, {
      origin: "https://mc.exacttarget.com",
      source: parent,
      data: { jwt: "aaa.bbb.ccc" },
    });

    expect(consumeEmbeddedJwt()).toBeNull();
  });

  it("buffers JWT from the parent frame when embedded", async () => {
    const { startEmbeddedJwtListener, consumeEmbeddedJwt } =
      await import("../embedded-jwt");

    const { win, parent } = makeMockWindow({ embedded: true });
    startEmbeddedJwtListener(win);

    dispatchMessage(win, {
      origin: "https://mc.exacttarget.com",
      source: parent,
      data: { jwt: "aaa.bbb.ccc" },
    });

    expect(consumeEmbeddedJwt()).toBe("aaa.bbb.ccc");
    expect(consumeEmbeddedJwt()).toBeNull();
  });
});
