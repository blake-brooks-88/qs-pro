import {
  CheckCircle,
  CloseCircle,
  DangerTriangle,
  InfoCircle,
  TrashBinMinimalistic,
} from "@solar-icons/react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import {
  useDeleteSiemConfig,
  useSiemConfig,
  useTestSiemWebhook,
  useUpsertSiemConfig,
} from "../hooks/use-siem-config";

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) {
    return "Never";
  }

  const date = new Date(isoDate);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) {
    return "Just now";
  }
  if (diffMinutes < 60) {
    return `${String(diffMinutes)} min ago`;
  }
  if (diffHours < 24) {
    return `${String(diffHours)} hr ago`;
  }
  if (diffDays < 30) {
    return `${String(diffDays)} day${diffDays === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({
  config,
}: {
  config: { enabled: boolean; consecutiveFailures: number };
}) {
  if (!config.enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border border-destructive/20 bg-destructive/10 text-destructive">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
        Disabled
      </span>
    );
  }

  if (config.consecutiveFailures > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-500">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Degraded
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Active
    </span>
  );
}

function SetupView() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [secretError, setSecretError] = useState("");
  const upsertMutation = useUpsertSiemConfig();

  const handleSave = useCallback(() => {
    let hasError = false;
    if (!webhookUrl.startsWith("https://")) {
      setUrlError("Webhook URL must use HTTPS");
      hasError = true;
    } else {
      setUrlError("");
    }
    if (secret.length < 16) {
      setSecretError("Secret must be at least 16 characters");
      hasError = true;
    } else {
      setSecretError("");
    }
    if (hasError) {
      return;
    }
    upsertMutation.mutate({ webhookUrl, secret });
  }, [webhookUrl, secret, upsertMutation]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="siem-setup-url"
          className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
        >
          Webhook URL
        </label>
        <Input
          id="siem-setup-url"
          placeholder="https://your-siem-endpoint.com/webhook"
          value={webhookUrl}
          onChange={(e) => {
            setWebhookUrl(e.target.value);
            if (urlError) {
              setUrlError("");
            }
          }}
        />
        {urlError ? (
          <p className="text-xs text-destructive ml-1">{urlError}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="siem-setup-secret"
          className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
        >
          Shared Secret
        </label>
        <div className="relative">
          <Input
            id="siem-setup-secret"
            type={showSecret ? "text" : "password"}
            placeholder="Minimum 16 characters"
            value={secret}
            onChange={(e) => {
              setSecret(e.target.value);
              if (secretError) {
                setSecretError("");
              }
            }}
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <span className="text-xs">{showSecret ? "Hide" : "Show"}</span>
          </button>
        </div>
        {secretError ? (
          <p className="text-xs text-destructive ml-1">{secretError}</p>
        ) : null}
      </div>
      <Button
        onClick={handleSave}
        disabled={!webhookUrl || secret.length < 16 || upsertMutation.isPending}
      >
        {upsertMutation.isPending ? "Saving..." : "Save Configuration"}
      </Button>
    </div>
  );
}

function ManagementView() {
  const { data: config } = useSiemConfig();
  const [webhookUrl, setWebhookUrl] = useState(config?.webhookUrl ?? "");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const upsertMutation = useUpsertSiemConfig();
  const deleteMutation = useDeleteSiemConfig();
  const testMutation = useTestSiemWebhook();

  const handleUpdate = useCallback(() => {
    if (!webhookUrl.startsWith("https://")) {
      setUrlError("Webhook URL must use HTTPS");
      return;
    }
    setUrlError("");
    upsertMutation.mutate({
      webhookUrl,
      ...(secret ? { secret } : {}),
    });
  }, [webhookUrl, secret, upsertMutation]);

  const handleTest = useCallback(() => {
    testMutation.mutate();
  }, [testMutation]);

  const handleDelete = useCallback(() => {
    deleteMutation.mutate(undefined, {
      onSuccess: () => setShowDeleteDialog(false),
    });
  }, [deleteMutation]);

  if (!config) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <StatusBadge config={config} />
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Last success: {formatRelativeTime(config.lastSuccessAt)}</span>
          <span>Failures: {String(config.consecutiveFailures)}</span>
        </div>
      </div>

      {!config.enabled && config.disabledReason ? (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/30 border border-border/50 text-[11px] text-muted-foreground">
          <DangerTriangle size={16} className="shrink-0 mt-0.5" />
          <p>
            Webhook disabled: {config.disabledReason}. Re-enable by updating the
            configuration below.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="siem-manage-url"
          className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
        >
          Webhook URL
        </label>
        <Input
          id="siem-manage-url"
          placeholder="https://your-siem-endpoint.com/webhook"
          value={webhookUrl}
          onChange={(e) => {
            setWebhookUrl(e.target.value);
            if (urlError) {
              setUrlError("");
            }
          }}
        />
        {urlError ? (
          <p className="text-xs text-destructive ml-1">{urlError}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="siem-manage-secret"
          className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
        >
          Shared Secret
        </label>
        <div className="relative">
          <Input
            id="siem-manage-secret"
            type={showSecret ? "text" : "password"}
            placeholder="Leave blank to keep current secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <span className="text-xs">{showSecret ? "Hide" : "Show"}</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={testMutation.isPending}
        >
          {testMutation.isPending ? "Testing..." : "Test Webhook"}
        </Button>
        <Button
          size="sm"
          onClick={handleUpdate}
          disabled={!webhookUrl || upsertMutation.isPending}
        >
          {upsertMutation.isPending ? "Updating..." : "Update Configuration"}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowDeleteDialog(true)}
        >
          <TrashBinMinimalistic size={14} className="mr-1" />
          Delete
        </Button>
      </div>

      {testMutation.data ? (
        <div className="flex items-center gap-1.5">
          {testMutation.data.success ? (
            <>
              <CheckCircle size={14} className="text-emerald-500" />
              <span className="text-xs text-emerald-500">
                Connected ({String(testMutation.data.statusCode ?? 200)})
              </span>
            </>
          ) : (
            <>
              <CloseCircle size={14} className="text-destructive" />
              <span className="text-xs text-destructive">
                {testMutation.data.error ?? "Connection failed"}
              </span>
            </>
          )}
        </div>
      ) : null}

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete SIEM Configuration</DialogTitle>
            <DialogDescription>
              This will disable the webhook and stop forwarding audit events.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SiemWebhookConfig() {
  const { data: config, isLoading } = useSiemConfig();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            SIEM Webhook Integration
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Forward audit events to your SIEM platform in real-time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <InfoCircle size={14} />
            Loading configuration...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          SIEM Webhook Integration
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Forward audit events to your SIEM platform in real-time.
        </CardDescription>
      </CardHeader>
      <CardContent>{config ? <ManagementView /> : <SetupView />}</CardContent>
    </Card>
  );
}
