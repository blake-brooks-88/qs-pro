import { useQuery } from "@tanstack/react-query";

import type { Folder } from "@/features/editor-workspace/types";
import type { DataFolderResponseDto } from "@/services/metadata";
import { getFolders } from "@/services/metadata";

export const queryActivityFoldersQueryKeys = {
  all: ["queryActivityFolders"] as const,
  list: (eid?: string) =>
    [...queryActivityFoldersQueryKeys.all, eid ?? "local"] as const,
};

function mapFolderResponse(dto: DataFolderResponseDto): Folder {
  const rawId = dto.ID;
  const rawParentId = dto.ParentFolder?.ID ?? null;

  return {
    id: String(rawId),
    name: dto.Name ?? "Unknown",
    parentId:
      rawParentId !== null && rawParentId !== 0 ? String(rawParentId) : null,
    type: "queryactivity" as const,
  };
}

export function useQueryActivityFolders(eid?: string) {
  return useQuery({
    queryKey: queryActivityFoldersQueryKeys.list(eid),
    queryFn: () => getFolders(eid, "queryactivity"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (data) => data.map(mapFolderResponse),
  });
}
