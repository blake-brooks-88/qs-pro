import { describe, expect, it, vi } from "vitest";

import { usePermissions } from "./use-permissions";

const { useSessionMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
}));

vi.mock("./use-session", () => ({
  useSession: useSessionMock,
}));

describe("usePermissions", () => {
  it("computes permissions from role hierarchy", () => {
    useSessionMock.mockReturnValue({ role: "viewer" });
    const viewer = usePermissions();
    expect(viewer.canView).toBe(true);
    expect(viewer.canEdit).toBe(false);
    expect(viewer.canAdmin).toBe(false);

    useSessionMock.mockReturnValue({ role: "editor" });
    const editor = usePermissions();
    expect(editor.canEdit).toBe(true);
    expect(editor.canAdmin).toBe(false);

    useSessionMock.mockReturnValue({ role: "admin" });
    const admin = usePermissions();
    expect(admin.canAdmin).toBe(true);
    expect(admin.isAtLeast("editor")).toBe(true);
  });
});
