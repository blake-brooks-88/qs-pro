import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { LaunchInstructionsPage } from "@/features/auth/launch-instructions-page";
import { EditorWorkspacePage } from "@/features/editor-workspace/EditorWorkspacePage";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { consumeEmbeddedJwt } from "@/services/embedded-jwt";
import { getMe, loginWithJwt } from "@/services/auth";
import type { Tenant, User } from "@/store/auth-store";
import { isPreviewModeEnabled } from "@/utils/preview-mode";

function isProbablyJwt(candidate: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(candidate);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getHttpStatus(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const response = error.response;
  if (!isRecord(response)) return null;
  const status = response.status;
  return typeof status === "number" ? status : null;
}

function getHttpData(error: unknown): unknown {
  if (!isRecord(error)) return undefined;
  const response = error.response;
  if (!isRecord(response)) return undefined;
  return response.data;
}

function App() {
  const { isAuthenticated, setAuth, logout } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLaunchHelp, setShowLaunchHelp] = useState(false);
  const [oauthRedirectAttempted, setOauthRedirectAttempted] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const previewEnabled = useMemo(() => isPreviewModeEnabled(), []);
  const isEmbedded = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 6;

    const seedPreviewAuth = (): void => {
      const user: User = {
        id: "preview-user",
        sfUserId: "preview-user",
        email: "preview@local.test",
        name: "Preview User",
      };
      const tenant: Tenant = {
        id: "preview-tenant",
        eid: "0000000",
        tssd: "preview",
      };
      setAuth(user, tenant, null);
      setPreviewActive(true);
      setError(null);
    };

    if (previewEnabled) {
      seedPreviewAuth();
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const checkAuth = async (): Promise<void> => {
      try {
        const response = await getMe();
        if (cancelled) return;
        setAuth(response.user, response.tenant, response.csrfToken);
        setPreviewActive(false);
      } catch (err) {
        if (cancelled) return;
        const status = getHttpStatus(err);
        const data = getHttpData(err);
        if (
          status === 401 &&
          isRecord(data) &&
          data.reason === "reauth_required"
        ) {
          logout();
          setShowLaunchHelp(true);
          return;
        }
        if (status === 401) {
          logout();
          if (isEmbedded && !oauthRedirectAttempted) {
            setOauthRedirectAttempted(true);
            window.location.assign("/api/auth/login");
            return;
          }
          if (isEmbedded && attempt < maxAttempts) {
            attempt += 1;
            const delayMs = Math.min(1000 * attempt, 5000);
            window.setTimeout(() => {
              void checkAuth();
            }, delayMs);
            return;
          }
          setShowLaunchHelp(true);
          return;
        }

        if (isRecord(err) && typeof err.message === "string" && err.message) {
          setError(err.message);
          return;
        }
        setError("Failed to connect to backend");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    checkAuth();
    return () => {
      cancelled = true;
    };
  }, [setAuth, logout, isEmbedded, oauthRedirectAttempted, previewEnabled]);

  useEffect(() => {
    if (!isEmbedded || isAuthenticated || previewEnabled) return;

    let cancelled = false;
    let loginInFlight = false;
    const bufferedJwt = consumeEmbeddedJwt();

    const tryJwtLogin = async (jwt: string): Promise<void> => {
      if (cancelled || loginInFlight) return;
      loginInFlight = true;
      try {
        await loginWithJwt(jwt);
        if (cancelled) return;
        const response = await getMe();
        if (cancelled) return;
        setAuth(response.user, response.tenant, response.csrfToken);
      } catch {
        // Intentionally ignore; backend will reject invalid/expired JWTs.
      } finally {
        loginInFlight = false;
      }
    };

    const handleMessage = (_event: MessageEvent): void => {
      if (cancelled) return;
      const jwt = consumeEmbeddedJwt();
      if (jwt) void tryJwtLogin(jwt);
    };

    const jwtFromQuery =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("jwt")?.trim() ?? null
        : null;

    const jwtCandidate =
      bufferedJwt || (jwtFromQuery && isProbablyJwt(jwtFromQuery) ? jwtFromQuery : null);
    if (jwtCandidate) void tryJwtLogin(jwtCandidate);

    window.addEventListener("message", handleMessage);
    return () => {
      cancelled = true;
      window.removeEventListener("message", handleMessage);
    };
  }, [isEmbedded, isAuthenticated, previewEnabled, setAuth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-muted-foreground animate-pulse">
            Initializing Query++...
          </p>
        </div>
      </div>
    );
  }

  if (error && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-destructive/5">
        <div className="p-8 max-w-md text-center space-y-4 border border-destructive/20 rounded-lg bg-background shadow-xl">
          <h2 className="text-xl font-bold text-destructive">
            Connection Error
          </h2>
          <p className="text-muted-foreground">{error}</p>
          <p className="text-xs">
            Please ensure the backend is running and reachable.
          </p>
          <Button onClick={() => window.location.reload()}>
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        {isEmbedded ? (
          showLaunchHelp ? (
            <LaunchInstructionsPage />
          ) : (
            <div className="flex items-center justify-center min-h-screen bg-background">
              <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <div>Authenticating with Marketing Cloud...</div>
                <Button
                  variant="secondary"
                  onClick={() => void window.location.reload()}
                >
                  Retry
                </Button>
                <Button variant="ghost" onClick={() => setShowLaunchHelp(true)}>
                  Launch Help
                </Button>
              </div>
            </div>
          )
        ) : (
          <LaunchInstructionsPage />
        )}
        <Toaster />
      </>
    );
  }

  return (
    <AppShell
      topNotice={
        previewActive ? (
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">
              Preview Mode (no org connection) — using local metadata fixtures.
            </span>
            <span className="text-[11px] opacity-80">
              Disable by unsetting <code className="font-mono">VITE_PREVIEW_MODE</code>
            </span>
          </div>
        ) : null
      }
    >
      <EditorWorkspacePage />
      <Toaster />
    </AppShell>
  );
}

export default App;
