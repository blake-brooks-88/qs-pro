interface CreatorAttributionProps {
  creatorName: string | null;
  updatedAt: string;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) {
    return "just now";
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${String(minutes)}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${String(hours)}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${String(days)}d ago`;
  }
  const months = Math.floor(days / 30);
  return `${String(months)}mo ago`;
}

export function CreatorAttribution({
  creatorName,
  updatedAt,
}: CreatorAttributionProps) {
  if (!creatorName) {
    return null;
  }

  return (
    <span className="text-[10px] text-muted-foreground/70 truncate ml-auto shrink-0">
      {creatorName} · {formatRelativeTime(updatedAt)}
    </span>
  );
}
