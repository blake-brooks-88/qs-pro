import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { EditorWorkspace } from "@/features/editor-workspace/components/EditorWorkspace";
import {
  metadataQueryKeys,
  useMetadata,
} from "@/features/editor-workspace/hooks/use-metadata";
import type { ExecutionResult } from "@/features/editor-workspace/types";
import { useAuthStore } from "@/store/auth-store";

const emptyExecutionResult: ExecutionResult = {
  status: "idle",
  runtime: "",
  totalRows: 0,
  currentPage: 1,
  pageSize: 50,
  columns: [],
  rows: [],
};

export function EditorWorkspacePage() {
  const { tenant } = useAuthStore();
  const queryClient = useQueryClient();
  const {
    folders,
    dataExtensions,
    isLoading,
    isDataExtensionsFetching,
    error,
  } = useMetadata({ tenantId: tenant?.id, eid: tenant?.eid });
  const [executionResult, setExecutionResult] =
    useState<ExecutionResult>(emptyExecutionResult);

  const errorKey = useMemo(() => {
    if (!error) {
      return null;
    }
    const status = error.status ? String(error.status) : "";
    const path = error.path ?? "";
    return `${error.kind}:${status}:${path}:${error.title}:${error.description ?? ""}`;
  }, [error]);

  const lastToastedErrorKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!errorKey || !error) {
      return;
    }
    if (lastToastedErrorKeyRef.current === errorKey) {
      return;
    }
    lastToastedErrorKeyRef.current = errorKey;

    toast.error(error.title, {
      description: error.description,
      action: {
        label: "Retry",
        onClick: () => {
          void queryClient.resetQueries({ queryKey: metadataQueryKeys.all });
          void queryClient.invalidateQueries({
            queryKey: metadataQueryKeys.all,
            refetchType: "active",
          });
        },
      },
    });
  }, [error, errorKey, queryClient]);

  const handlePageChange = (page: number) => {
    setExecutionResult((prev) => ({
      ...prev,
      currentPage: page,
    }));
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {isLoading ? (
        <div className="border-b border-border bg-card/50 px-4 py-2 text-xs text-muted-foreground">
          Loading Data Extension metadata...
        </div>
      ) : null}
      <EditorWorkspace
        tenantId={tenant?.id}
        eid={tenant?.eid}
        folders={folders}
        savedQueries={[]}
        dataExtensions={dataExtensions}
        executionResult={executionResult}
        isSidebarCollapsed={false}
        isDataExtensionsFetching={isDataExtensionsFetching}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
