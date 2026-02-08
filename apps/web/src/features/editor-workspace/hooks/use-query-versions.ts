import type {
  UpdateVersionNameDto,
  VersionDetail,
  VersionListResponse,
} from "@qpp/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/services/api";

export const versionHistoryKeys = {
  all: ["versionHistory"] as const,
  list: (savedQueryId: string) =>
    ["versionHistory", "list", savedQueryId] as const,
  detail: (savedQueryId: string, versionId: string) =>
    ["versionHistory", "detail", savedQueryId, versionId] as const,
};

async function fetchVersions(
  savedQueryId: string,
): Promise<VersionListResponse> {
  const { data } = await api.get<VersionListResponse>(
    `/saved-queries/${savedQueryId}/versions`,
  );
  return data;
}

async function fetchVersionDetail(
  savedQueryId: string,
  versionId: string,
): Promise<VersionDetail> {
  const { data } = await api.get<VersionDetail>(
    `/saved-queries/${savedQueryId}/versions/${versionId}`,
  );
  return data;
}

export function useQueryVersions(savedQueryId: string | undefined) {
  return useQuery({
    queryKey: versionHistoryKeys.list(savedQueryId ?? ""),
    queryFn: () => {
      if (!savedQueryId) {
        throw new Error("savedQueryId is required");
      }
      return fetchVersions(savedQueryId);
    },
    enabled: !!savedQueryId,
    staleTime: 30_000,
  });
}

export function useVersionDetail(
  savedQueryId: string | undefined,
  versionId: string | undefined,
) {
  return useQuery({
    queryKey: versionHistoryKeys.detail(savedQueryId ?? "", versionId ?? ""),
    queryFn: () => {
      if (!savedQueryId || !versionId) {
        throw new Error("savedQueryId and versionId are required");
      }
      return fetchVersionDetail(savedQueryId, versionId);
    },
    enabled: !!savedQueryId && !!versionId,
    staleTime: Infinity,
  });
}

export function useRestoreVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      savedQueryId,
      versionId,
    }: {
      savedQueryId: string;
      versionId: string;
    }) => {
      const { data } = await api.post(
        `/saved-queries/${savedQueryId}/versions/${versionId}/restore`,
      );
      return data;
    },
    onSuccess: (_data, { savedQueryId }) => {
      void queryClient.invalidateQueries({
        queryKey: versionHistoryKeys.list(savedQueryId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["saved-queries"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["saved-query", savedQueryId],
      });
    },
  });
}

export function useUpdateVersionName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      savedQueryId,
      versionId,
      data,
    }: {
      savedQueryId: string;
      versionId: string;
      data: UpdateVersionNameDto;
    }) => {
      const { data: result } = await api.patch(
        `/saved-queries/${savedQueryId}/versions/${versionId}`,
        data,
      );
      return result;
    },
    onSuccess: (_data, { savedQueryId }) => {
      void queryClient.invalidateQueries({
        queryKey: versionHistoryKeys.list(savedQueryId),
      });
    },
  });
}
