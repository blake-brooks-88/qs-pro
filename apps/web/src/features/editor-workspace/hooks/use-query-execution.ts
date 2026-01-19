import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  DataExtension,
  DataExtensionField,
} from "@/features/editor-workspace/types";
import { extractTableReferences } from "@/features/editor-workspace/utils/sql-context";
import api from "@/services/api";

import { metadataQueryKeys } from "./use-metadata";
import {
  runResultsQueryKeys,
  type RunResultsResponse,
  useRunResults,
} from "./use-run-results";

export type QueryExecutionStatus =
  | "idle"
  | "queued"
  | "running"
  | "creating_data_extension"
  | "validating_query"
  | "executing_query"
  | "fetching_results"
  | "ready"
  | "failed"
  | "canceled";

interface SSEEvent {
  status: QueryExecutionStatus;
  message: string;
  errorMessage?: string;
  timestamp: string;
  runId: string;
}

interface QueryResults {
  data: RunResultsResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

interface FieldDefinition {
  Name: string;
  FieldType: string;
  MaxLength?: number;
}

function safeRecordSet<V>(
  record: Record<string, V>,
  key: string,
  value: V,
): void {
  if (
    typeof key === "string" &&
    key !== "__proto__" &&
    key !== "constructor" &&
    key !== "prototype"
  ) {
    // eslint-disable-next-line security/detect-object-injection
    record[key] = value;
  }
}

interface UseQueryExecutionOptions {
  tenantId?: string | null;
  eid?: string;
}

interface UseQueryExecutionResult {
  execute: (sqlText: string, snippetName?: string) => Promise<void>;
  cancel: () => Promise<void>;
  status: QueryExecutionStatus;
  isRunning: boolean;
  runId: string | null;
  errorMessage: string | null;
  results: QueryResults;
  currentPage: number;
  setPage: (page: number) => void;
}

const TERMINAL_STATES: QueryExecutionStatus[] = [
  "idle",
  "ready",
  "failed",
  "canceled",
];
const SESSION_STORAGE_KEY = "activeRunId";

function isTerminalState(status: QueryExecutionStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

function mapFieldToDefinition(field: DataExtensionField): FieldDefinition {
  const FIELD_TYPE_MAP: Record<string, string> = {
    Text: "Text",
    Number: "Number",
    Date: "Date",
    Boolean: "Boolean",
    Email: "EmailAddress",
    Phone: "Phone",
    Decimal: "Decimal",
  };

  return {
    Name: field.name,
    FieldType: FIELD_TYPE_MAP[field.type] ?? "Text",
    MaxLength: field.length,
  };
}

export function useQueryExecution(
  options: UseQueryExecutionOptions = {},
): UseQueryExecutionResult {
  const { tenantId, eid } = options;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<QueryExecutionStatus>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasShownErrorRef = useRef(false);

  const resultsQuery = useRunResults({
    runId,
    page: currentPage,
    enabled: status === "ready",
  });

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const clearSessionStorage = useCallback(() => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }, []);

  const handleTerminalState = useCallback(
    (newStatus: QueryExecutionStatus, newErrorMessage?: string) => {
      setStatus(newStatus);
      if (newErrorMessage) {
        setErrorMessage(newErrorMessage);
      }
      closeEventSource();
      clearSessionStorage();
    },
    [closeEventSource, clearSessionStorage],
  );

  const subscribeToSSE = useCallback(
    (targetRunId: string) => {
      closeEventSource();
      hasShownErrorRef.current = false;

      const eventSource = new EventSource(`/api/runs/${targetRunId}/events`, {
        withCredentials: true,
      });

      eventSource.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string) as SSEEvent;
          hasShownErrorRef.current = false;

          if (isTerminalState(data.status)) {
            handleTerminalState(data.status, data.errorMessage);
          } else {
            setStatus(data.status);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      eventSource.onerror = () => {
        if (!hasShownErrorRef.current) {
          toast.error("Connection lost. Refresh to check status.");
          hasShownErrorRef.current = true;
        }
      };

      eventSourceRef.current = eventSource;
    },
    [closeEventSource, handleTerminalState],
  );

  const getFieldsFromCache = useCallback(
    (tableName: string): DataExtensionField[] | null => {
      const dataExtensions = queryClient.getQueryData<DataExtension[]>(
        metadataQueryKeys.dataExtensions(tenantId, eid),
      );

      const de = dataExtensions?.find(
        (d) => d.name.toLowerCase() === tableName.toLowerCase(),
      );

      const lookupKey = de?.customerKey ?? tableName;
      const queryKey = metadataQueryKeys.fields(tenantId, lookupKey);
      return queryClient.getQueryData<DataExtensionField[]>(queryKey) ?? null;
    },
    [queryClient, tenantId, eid],
  );

  const buildTableMetadata = useCallback(
    (sqlText: string): Record<string, FieldDefinition[]> => {
      const tableMetadata: Record<string, FieldDefinition[]> = {};
      const tableReferences = extractTableReferences(sqlText);

      for (const ref of tableReferences) {
        if (ref.isSubquery) {
          continue;
        }

        const tableName = ref.name;
        const fields = getFieldsFromCache(tableName);

        if (fields && fields.length > 0) {
          safeRecordSet(
            tableMetadata,
            tableName,
            fields.map(mapFieldToDefinition),
          );
        }
      }

      return tableMetadata;
    },
    [getFieldsFromCache],
  );

  const execute = useCallback(
    async (sqlText: string, snippetName?: string): Promise<void> => {
      setCurrentPage(1);
      if (runId) {
        queryClient.removeQueries({
          queryKey: runResultsQueryKeys.all,
          predicate: (query) => query.queryKey[1] === runId,
        });
      }

      try {
        const tableMetadata = buildTableMetadata(sqlText);

        const response = await api.post<{
          runId: string;
          status: QueryExecutionStatus;
        }>("/runs", { sqlText, snippetName, tableMetadata });

        const { runId: newRunId, status: newStatus } = response.data;

        setRunId(newRunId);
        setStatus(newStatus);
        setErrorMessage(null);
        sessionStorage.setItem(SESSION_STORAGE_KEY, newRunId);

        subscribeToSSE(newRunId);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          toast.error(
            "Too many queries running. Close a tab or wait for a query to complete.",
          );
          setStatus("idle");
          return;
        }
        throw error;
      }
    },
    [subscribeToSSE, runId, queryClient, buildTableMetadata],
  );

  const cancel = useCallback(async (): Promise<void> => {
    if (!runId) {
      return;
    }

    try {
      await api.post(`/runs/${runId}/cancel`);
      handleTerminalState("canceled");
    } catch {
      // Silently handle cancel failures
    }
  }, [runId, handleTerminalState]);

  const isRunning = !isTerminalState(status);

  useEffect(() => {
    const storedRunId = sessionStorage.getItem(SESSION_STORAGE_KEY);

    if (!storedRunId) {
      return;
    }

    const reconnect = async () => {
      try {
        const response = await api.get<{
          runId: string;
          status: QueryExecutionStatus;
          errorMessage?: string;
        }>(`/runs/${storedRunId}`);

        const {
          runId: fetchedRunId,
          status: fetchedStatus,
          errorMessage: fetchedErrorMessage,
        } = response.data;

        setRunId(fetchedRunId);

        if (isTerminalState(fetchedStatus)) {
          handleTerminalState(fetchedStatus, fetchedErrorMessage);
        } else {
          setStatus(fetchedStatus);
          subscribeToSSE(fetchedRunId);
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          clearSessionStorage();
          setStatus("idle");
          setRunId(null);
          return;
        }
        clearSessionStorage();
        setStatus("idle");
        setRunId(null);
      }
    };

    void reconnect();
  }, [handleTerminalState, subscribeToSSE, clearSessionStorage]);

  useEffect(() => {
    return () => {
      closeEventSource();
    };
  }, [closeEventSource]);

  const setPage = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const results: QueryResults = {
    data: resultsQuery.data ?? null,
    isLoading: resultsQuery.isLoading,
    error: resultsQuery.error,
    refetch: resultsQuery.refetch,
  };

  return {
    execute,
    cancel,
    status,
    isRunning,
    runId,
    errorMessage,
    results,
    currentPage,
    setPage,
  };
}
