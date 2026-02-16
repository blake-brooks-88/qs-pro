type EndableSqlClient = {
  end: (options?: { timeout?: number }) => Promise<void>;
};

let exitTriggered = false;

export function triggerFailClosedExit(sql: EndableSqlClient): void {
  if (exitTriggered) {
    return;
  }
  exitTriggered = true;

  process.exitCode = 1;

  const fallback = setTimeout(() => process.exit(1), 1_000);
  fallback.unref?.();

  void sql
    .end({ timeout: 0 })
    .catch(() => undefined)
    .then(() => {
      clearTimeout(fallback);
      process.exit(1);
    });
}
