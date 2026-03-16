import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "@/services/api";

import { relationshipGraphKeys } from "./use-relationship-graph";

interface SaveRelationshipParams {
  ruleType: "alias_group" | "explicit_link" | "exclusion";
  sourceDE: string;
  sourceColumn: string;
  targetDE: string;
  targetColumn: string;
  folderId: string;
}

interface DismissRelationshipParams {
  sourceDE: string;
  sourceColumn: string;
  targetDE: string;
  targetColumn: string;
  folderId: string;
}

export function useSaveRelationship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SaveRelationshipParams) => {
      const response = await api.post("/relationships/rules", params);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: relationshipGraphKeys.graph,
      });
    },
  });
}

export function useDismissRelationship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DismissRelationshipParams) => {
      const response = await api.post("/relationships/dismiss", params);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: relationshipGraphKeys.graph,
      });
    },
  });
}

export function useDeleteRelationship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ruleId: string) => {
      await api.delete(`/relationships/rules/${ruleId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: relationshipGraphKeys.graph,
      });
    },
  });
}
