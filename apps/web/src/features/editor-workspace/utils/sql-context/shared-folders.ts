import type { Folder } from "@/features/editor-workspace/types";

export function getSharedFolderIds(folders: Folder[]) {
  const sharedRoots = folders.filter(
    (folder) => folder.name.trim().toLowerCase() === "shared",
  );
  if (sharedRoots.length === 0) {
    return new Set<string>();
  }

  const byParent = new Map<string | null, Folder[]>();
  folders.forEach((folder) => {
    const key = folder.parentId ?? null;
    const existing = byParent.get(key) ?? [];
    existing.push(folder);
    byParent.set(key, existing);
  });

  const sharedIds = new Set<string>();
  const queue = [...sharedRoots];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    sharedIds.add(current.id);
    const children = byParent.get(current.id) ?? [];
    children.forEach((child) => queue.push(child));
  }

  return sharedIds;
}
