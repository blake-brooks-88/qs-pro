import { useEffect } from "react";

export function useBeforeUnloadDirtyTabs(
  tabs: ReadonlyArray<{ isDirty: boolean }>,
): void {
  useEffect(() => {
    const hasDirtyTabs = tabs.some((t) => t.isDirty);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasDirtyTabs) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [tabs]);
}
