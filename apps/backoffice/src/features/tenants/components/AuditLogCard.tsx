import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { AuditLogEntryDto } from "../hooks/use-tenant-detail";

interface AuditLogCardProps {
  logs: AuditLogEntryDto[];
}

function formatEventType(eventType: string): string {
  return eventType
    .split(".")
    .map((part) =>
      part
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    )
    .join(" > ");
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AuditLogCard({ logs }: AuditLogCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit Log</CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit entries.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 py-2 px-2 rounded hover:bg-muted/20 transition-colors text-xs"
              >
                <span className="shrink-0 text-muted-foreground w-[100px]">
                  {formatTimestamp(log.createdAt)}
                </span>
                <span className="font-medium text-foreground">
                  {formatEventType(log.eventType)}
                </span>
                {log.metadata ? (
                  <span className="text-muted-foreground truncate">
                    {JSON.stringify(log.metadata)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { AuditLogCard };
