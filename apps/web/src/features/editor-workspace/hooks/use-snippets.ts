import type {
  CreateSnippetDto,
  SnippetListItem,
  SnippetResponse,
  UpdateSnippetDto,
} from "@qpp/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useFeature } from "@/hooks/use-feature";
import api from "@/services/api";

const SNIPPETS_KEY = ["snippets"] as const;

export function useSnippets() {
  const { enabled: isTeamSnippetsEnabled } = useFeature("teamSnippets");

  return useQuery({
    queryKey: SNIPPETS_KEY,
    queryFn: async () => {
      const response = await api.get<SnippetListItem[]>("/snippets");
      return response.data;
    },
    enabled: isTeamSnippetsEnabled,
  });
}

export function useCreateSnippet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSnippetDto) => {
      const response = await api.post<SnippetResponse>("/snippets", data);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNIPPETS_KEY });
    },
  });
}

export function useUpdateSnippet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateSnippetDto;
    }) => {
      const response = await api.patch<SnippetResponse>(
        `/snippets/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNIPPETS_KEY });
    },
  });
}

export function useDeleteSnippet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/snippets/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNIPPETS_KEY });
    },
  });
}
