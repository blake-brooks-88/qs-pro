import { useCallback, useMemo, useState } from "react";
import { EditorWorkspace } from "@/features/editor-workspace/components/EditorWorkspace";
import { useMetadata } from "@/features/editor-workspace/hooks/use-metadata";
import type {
  ExecutionCell,
  ExecutionResult,
  QueryTab,
} from "@/features/editor-workspace/types";
import { useAuthStore } from "@/store/auth-store";
import previewCatalogJson from "@/preview/fixtures/preview-catalog.json";

type PreviewCatalog = {
  rowsByKey: Map<string, Record<string, ExecutionCell>[]>;
};

function parsePreviewCatalog(json: unknown): PreviewCatalog {
  const data = json as {
    rowsByKey?: Record<string, Record<string, ExecutionCell>[]>;
  };
  const rowsByKey = new Map<string, Record<string, ExecutionCell>[]>();
  if (data.rowsByKey) {
    for (const [key, rows] of Object.entries(data.rowsByKey)) {
      rowsByKey.set(key, rows);
    }
  }
  return { rowsByKey };
}

const previewCatalog = parsePreviewCatalog(previewCatalogJson);

const emptyExecutionResult: ExecutionResult = {
  status: "idle",
  runtime: "",
  totalRows: 0,
  currentPage: 1,
  pageSize: 50,
  columns: [],
  rows: [],
};

function buildColumns(rows: Record<string, ExecutionCell>[]): string[] {
  const firstRow = rows.at(0);
  return firstRow ? Object.keys(firstRow) : [];
}

function paginateRows(
  rows: Record<string, ExecutionCell>[],
  page: number,
  pageSize: number,
): Record<string, ExecutionCell>[] {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

function pickDefaultRows(): {
  customerKey: string | null;
  rows: Record<string, ExecutionCell>[];
} {
  const keys = [...previewCatalog.rowsByKey.keys()];
  const customerKey = keys.at(0) ?? null;
  const rows = customerKey
    ? (previewCatalog.rowsByKey.get(customerKey) ?? [])
    : [];
  return { customerKey, rows };
}

export function PreviewEditorWorkspacePage() {
  const { tenant } = useAuthStore();
  const {
    folders,
    dataExtensions,
    isLoading,
    isDataExtensionsFetching,
    error,
  } = useMetadata({ tenantId: tenant?.id, eid: tenant?.eid });

  const [{ customerKey, rows: allRows }] = useState(() => pickDefaultRows());

  const initialTabs = useMemo<QueryTab[]>(() => {
    const query = customerKey ? `SELECT *\nFROM [${customerKey}]` : "SELECT 1";
    return [
      {
        id: "preview-tab-1",
        name: "Sample Query",
        content: query,
        isDirty: false,
        isNew: false,
      },
    ];
  }, [customerKey]);

  const [executionResult, setExecutionResult] =
    useState<ExecutionResult>(emptyExecutionResult);

  const runPreviewQuery = useCallback(() => {
    const columns = buildColumns(allRows);
    const page = 1;
    const pageSize = executionResult.pageSize;

    setExecutionResult({
      status: "running",
      runtime: "",
      totalRows: allRows.length,
      currentPage: page,
      pageSize,
      columns,
      rows: [],
    });

    window.setTimeout(() => {
      setExecutionResult({
        status: "success",
        runtime: "0.21s",
        totalRows: allRows.length,
        currentPage: page,
        pageSize,
        columns,
        rows: paginateRows(allRows, page, pageSize),
      });
    }, 250);
  }, [allRows, executionResult.pageSize]);

  const handlePageChange = useCallback(
    (page: number) => {
      setExecutionResult((prev) => ({
        ...prev,
        currentPage: page,
        rows: paginateRows(allRows, page, prev.pageSize),
      }));
    },
    [allRows],
  );

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {isLoading ? (
        <div className="border-b border-border bg-card/50 px-4 py-2 text-xs text-muted-foreground">
          Loading sample metadata...
        </div>
      ) : null}

      <EditorWorkspace
        tenantId={tenant?.id}
        folders={folders}
        savedQueries={[]}
        dataExtensions={dataExtensions}
        executionResult={executionResult}
        initialTabs={initialTabs}
        isSidebarCollapsed={false}
        isDataExtensionsFetching={isDataExtensionsFetching}
        onRun={() => runPreviewQuery()}
        onPageChange={handlePageChange}
      />

      {error ? (
        <div className="border-t border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {error.title}
        </div>
      ) : null}
    </div>
  );
}
