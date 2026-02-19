export interface FolderLike {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * Returns an array of folders representing the ancestor chain from root to the given folderId.
 * The chain includes the folder identified by folderId if it exists.
 */
export function getFolderAncestors<T extends FolderLike>(
  folders: T[],
  folderId: string | null,
): T[] {
  if (!folderId) {
    return [];
  }

  const ancestors: T[] = [];
  const visited = new Set<string>();
  let currentId: string | null = folderId;
  const folderMap = new Map(folders.map((f) => [f.id, f]));

  while (currentId) {
    if (visited.has(currentId)) {
      break; // Cycle detected
    }
    visited.add(currentId);

    const folder = folderMap.get(currentId);
    if (!folder) {
      break;
    }

    ancestors.unshift(folder);
    currentId = folder.parentId;
  }

  return ancestors;
}

/**
 * Returns a displayable path string for a folder (e.g., "Root > Subfolder > TargetedFolder").
 */
export function getFolderPath<T extends FolderLike>(
  folders: T[],
  folderId: string | null,
): string {
  const ancestors = getFolderAncestors(folders, folderId);
  return ancestors.map((f) => f.name).join(" > ");
}
