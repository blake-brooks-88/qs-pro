import { describe, expect, it, vi } from "vitest";

describe("triggerFailClosedExit", () => {
  it("ends the SQL client once and exits (idempotent)", async () => {
    vi.useFakeTimers();

    const originalExitCode = process.exitCode;
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    const sqlOk = {
      end: vi.fn().mockResolvedValue(undefined),
    };

    const { triggerFailClosedExit } = await import("./fail-closed-exit");
    triggerFailClosedExit(sqlOk);
    triggerFailClosedExit(sqlOk);

    await Promise.resolve();
    await Promise.resolve();

    expect(process.exitCode).toBe(1);
    expect(sqlOk.end).toHaveBeenCalledTimes(1);
    expect(sqlOk.end).toHaveBeenCalledWith({ timeout: 0 });
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(vi.getTimerCount()).toBe(0);

    exitSpy.mockClear();
    process.exitCode = originalExitCode;
    vi.resetModules();

    const sqlReject = {
      end: vi.fn().mockRejectedValue(new Error("end failed")),
    };

    const { triggerFailClosedExit: triggerFailClosedExit2 } =
      await import("./fail-closed-exit");
    triggerFailClosedExit2(sqlReject);

    await Promise.resolve();
    await Promise.resolve();

    expect(process.exitCode).toBe(1);
    expect(sqlReject.end).toHaveBeenCalledTimes(1);
    expect(sqlReject.end).toHaveBeenCalledWith({ timeout: 0 });
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(vi.getTimerCount()).toBe(0);

    exitSpy.mockRestore();
    process.exitCode = originalExitCode;
    vi.useRealTimers();
  });
});
