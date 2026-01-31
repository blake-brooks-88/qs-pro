import type {
  CreateSavedQueryDto,
  SavedQueryListItem,
  SavedQueryResponse,
  UpdateSavedQueryDto,
} from "@qpp/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/services/api";

const SAVED_QUERIES_KEY = ["saved-queries"] as const;
const SAVED_QUERY_KEY = (id: string) => ["saved-query", id] as const;
const SAVED_QUERY_COUNT_KEY = ["saved-queries", "count"] as const;

// Query hook - fetch all saved queries (list items without SQL text)
export function useSavedQueries(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: SAVED_QUERIES_KEY,
    queryFn: async () => {
      const response = await api.get<SavedQueryListItem[]>("/saved-queries");
      return response.data;
    },
    enabled: options?.enabled ?? true,
  });
}

// Query hook - fetch single saved query with SQL text
export function useSavedQuery(id: string | undefined) {
  return useQuery({
    queryKey: SAVED_QUERY_KEY(id ?? ""),
    queryFn: async () => {
      if (!id) {
        throw new Error("No query ID provided");
      }
      const response = await api.get<SavedQueryResponse>(
        `/saved-queries/${id}`,
      );
      return response.data;
    },
    enabled: !!id,
  });
}

// Query hook - fetch count for quota checking
export function useSavedQueryCount(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: SAVED_QUERY_COUNT_KEY,
    queryFn: async () => {
      const response = await api.get<{ count: number }>("/saved-queries/count");
      return response.data.count;
    },
    enabled: options?.enabled ?? true,
  });
}

// Mutation - create saved query
export function useCreateSavedQuery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSavedQueryDto) => {
      const response = await api.post<SavedQueryResponse>(
        "/saved-queries",
        data,
      );
      return response.data;
    },
    onSuccess: (newQuery) => {
      // Add to list cache
      queryClient.setQueryData<SavedQueryListItem[]>(
        SAVED_QUERIES_KEY,
        (old) => [
          ...(old ?? []),
          {
            id: newQuery.id,
            name: newQuery.name,
            folderId: newQuery.folderId,
            updatedAt: newQuery.updatedAt,
          },
        ],
      );
      // Invalidate count
      void queryClient.invalidateQueries({ queryKey: SAVED_QUERY_COUNT_KEY });
    },
  });
}

// Mutation - update saved query
export function useUpdateSavedQuery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateSavedQueryDto;
    }) => {
      const response = await api.patch<SavedQueryResponse>(
        `/saved-queries/${id}`,
        data,
      );
      return response.data;
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: SAVED_QUERIES_KEY });
      await queryClient.cancelQueries({ queryKey: SAVED_QUERY_KEY(id) });

      const previousList =
        queryClient.getQueryData<SavedQueryListItem[]>(SAVED_QUERIES_KEY);
      const previousQuery = queryClient.getQueryData<SavedQueryResponse>(
        SAVED_QUERY_KEY(id),
      );

      // Optimistic update list
      if (previousList) {
        queryClient.setQueryData<SavedQueryListItem[]>(
          SAVED_QUERIES_KEY,
          (old) =>
            old?.map((q) =>
              q.id === id
                ? {
                    ...q,
                    name: data.name ?? q.name,
                    folderId:
                      data.folderId !== undefined ? data.folderId : q.folderId,
                  }
                : q,
            ),
        );
      }

      // Optimistic update single query
      if (previousQuery) {
        queryClient.setQueryData<SavedQueryResponse>(SAVED_QUERY_KEY(id), {
          ...previousQuery,
          ...data,
        });
      }

      return { previousList, previousQuery };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(SAVED_QUERIES_KEY, context.previousList);
      }
      if (context?.previousQuery) {
        queryClient.setQueryData(SAVED_QUERY_KEY(id), context.previousQuery);
      }
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: SAVED_QUERIES_KEY });
      void queryClient.invalidateQueries({ queryKey: SAVED_QUERY_KEY(id) });
    },
  });
}

// Mutation - delete saved query
export function useDeleteSavedQuery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/saved-queries/${id}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: SAVED_QUERIES_KEY });

      const previous =
        queryClient.getQueryData<SavedQueryListItem[]>(SAVED_QUERIES_KEY);

      if (previous) {
        queryClient.setQueryData<SavedQueryListItem[]>(
          SAVED_QUERIES_KEY,
          (old) => old?.filter((q) => q.id !== id),
        );
      }

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SAVED_QUERIES_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SAVED_QUERIES_KEY });
      void queryClient.invalidateQueries({ queryKey: SAVED_QUERY_COUNT_KEY });
    },
  });
}
