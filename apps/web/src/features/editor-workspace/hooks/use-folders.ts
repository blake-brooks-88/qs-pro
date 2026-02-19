import type {
  CreateFolderDto,
  FolderResponse,
  UpdateFolderDto,
} from "@qpp/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/services/api";

const FOLDERS_KEY = ["folders"] as const;

function createOptimisticFolderId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `temp-${crypto.randomUUID()}`;
  }
  return `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Query hook - fetch all folders
export function useFolders(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: FOLDERS_KEY,
    queryFn: async () => {
      const response = await api.get<FolderResponse[]>("/folders");
      return response.data;
    },
    enabled: options?.enabled ?? true,
  });
}

// Mutation - create folder
export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateFolderDto) => {
      const response = await api.post<FolderResponse>("/folders", data);
      return response.data;
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: FOLDERS_KEY });

      const previous = queryClient.getQueryData<FolderResponse[]>(FOLDERS_KEY);
      const optimisticId = createOptimisticFolderId();

      queryClient.setQueryData<FolderResponse[]>(FOLDERS_KEY, (old) => [
        ...(old ?? []),
        {
          id: optimisticId,
          name: data.name,
          parentId: data.parentId ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      return { previous, optimisticId };
    },
    onSuccess: (created, _vars, context) => {
      if (!context?.optimisticId) {
        return;
      }

      queryClient.setQueryData<FolderResponse[]>(FOLDERS_KEY, (old) => {
        const next = old ?? [];
        const idx = next.findIndex((f) => f.id === context.optimisticId);
        if (idx === -1) {
          return [...next, created];
        }
        const copy = [...next];
        copy[idx] = created;
        return copy;
      });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(FOLDERS_KEY, context.previous);
        return;
      }
      queryClient.removeQueries({ queryKey: FOLDERS_KEY, exact: true });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
    },
  });
}

// Mutation - update folder
export function useUpdateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateFolderDto }) => {
      const response = await api.patch<FolderResponse>(`/folders/${id}`, data);
      return response.data;
    },
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: FOLDERS_KEY });

      // Snapshot current data
      const previous = queryClient.getQueryData<FolderResponse[]>(FOLDERS_KEY);

      // Optimistic update
      if (previous) {
        queryClient.setQueryData<FolderResponse[]>(FOLDERS_KEY, (old) =>
          old?.map((f) => (f.id === id ? { ...f, ...data } : f)),
        );
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(FOLDERS_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
    },
  });
}

// Mutation - delete folder
export function useDeleteFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/folders/${id}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: FOLDERS_KEY });

      const previous = queryClient.getQueryData<FolderResponse[]>(FOLDERS_KEY);

      if (previous) {
        queryClient.setQueryData<FolderResponse[]>(FOLDERS_KEY, (old) =>
          old?.filter((f) => f.id !== id),
        );
      }

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(FOLDERS_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
    },
  });
}
