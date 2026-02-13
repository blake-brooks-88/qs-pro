import type { PublishEventListItem, VersionListItem } from "@qpp/shared-types";

export function computeVersionGap(
  versions: VersionListItem[],
  currentPublishedVersionId: string | null,
): number {
  if (!currentPublishedVersionId) {
    return 0;
  }
  const sorted = [...versions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const publishedIndex = sorted.findIndex(
    (v) => v.id === currentPublishedVersionId,
  );
  if (publishedIndex <= 0) {
    return 0;
  }
  return publishedIndex;
}

export interface PublishState {
  currentPublishedVersionId: string | null;
  publishedVersionIds: Set<string>;
  publishEventsByVersionId: Map<string, PublishEventListItem[]>;
}

export function derivePublishState(
  events: PublishEventListItem[],
): PublishState {
  if (events.length === 0) {
    return {
      currentPublishedVersionId: null,
      publishedVersionIds: new Set(),
      publishEventsByVersionId: new Map(),
    };
  }

  const currentPublishedVersionId = events[0]?.versionId ?? null;

  const publishedVersionIds = new Set<string>();
  const publishEventsByVersionId = new Map<string, PublishEventListItem[]>();

  for (const event of events) {
    publishedVersionIds.add(event.versionId);
    const existing = publishEventsByVersionId.get(event.versionId);
    if (existing) {
      existing.push(event);
    } else {
      publishEventsByVersionId.set(event.versionId, [event]);
    }
  }

  return {
    currentPublishedVersionId,
    publishedVersionIds,
    publishEventsByVersionId,
  };
}
