import * as Sentry from "@sentry/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { DevSubscriptionPanel } from "@/components/dev/DevSubscriptionPanel";
import { PricingOverlay } from "@/components/pricing-overlay";
import { TrialBanner } from "@/components/TrialBanner";
import { TrialExpiredBanner } from "@/components/TrialExpiredBanner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { LaunchInstructionsPage } from "@/features/auth/launch-instructions-page";
import { EditorWorkspacePage } from "@/features/editor-workspace/EditorWorkspacePage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { usageQueryKeys } from "@/hooks/use-run-usage";
import { featuresQueryKeys } from "@/hooks/use-tenant-features";
import { useTrial } from "@/hooks/use-trial";
import { track } from "@/lib/analytics";
import {
  CHECKOUT_RETURN_SIGNAL_STORAGE_KEY,
  type CheckoutReturnSignal,
  isCheckoutReturnSignalMessage,
  parseCheckoutReturnSignal,
} from "@/lib/checkout-return-signal";
import {
  clearPendingCheckout,
  hasPendingCheckout,
  PENDING_CHECKOUT_CHANGED_EVENT,
} from "@/lib/pending-checkout";
import { getMe, loginWithJwt } from "@/services/auth";
import { confirmCheckoutSession } from "@/services/billing";
import { consumeEmbeddedJwt } from "@/services/embedded-jwt";
import { getTenantFeatures } from "@/services/features";
import { useAuthStore } from "@/store/auth-store";
import { usePricingOverlayStore } from "@/store/pricing-overlay-store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getHttpStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }
  const response = error.response;
  if (!isRecord(response)) {
    return null;
  }
  const status = response.status;
  return typeof status === "number" ? status : null;
}

function getHttpData(error: unknown): unknown {
  if (!isRecord(error)) {
    return undefined;
  }
  const response = error.response;
  if (!isRecord(response)) {
    return undefined;
  }
  return response.data;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

const PENDING_CHECKOUT_SESSION_KEY = "pendingCheckoutSessionId";

function App() {
  const queryClient = useQueryClient();
  const { isAuthenticated, setAuth, logout } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLaunchHelp, setShowLaunchHelp] = useState(false);
  const [oauthRedirectAttempted, setOauthRedirectAttempted] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [currentView, setCurrentView] = useState<"editor" | "settings">(
    "editor",
  );
  const [pendingCheckoutActive, setPendingCheckoutActive] = useState(() =>
    hasPendingCheckout(),
  );
  const { showCountdown, isTrialExpired, daysRemaining } = useTrial();
  const openPricing = usePricingOverlayStore((s) => s.open);
  const closePricing = usePricingOverlayStore((s) => s.close);
  const isEmbedded = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
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

    const checkAuth = async (): Promise<void> => {
      try {
        const response = await getMe();
        if (cancelled) {
          return;
        }
        setAuth(response.user, response.tenant, response.csrfToken);
      } catch (err) {
        if (cancelled) {
          return;
        }
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
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, [setAuth, logout, isEmbedded, oauthRedirectAttempted]);

  useEffect(() => {
    if (!isEmbedded || isAuthenticated) {
      return;
    }

    let cancelled = false;
    let loginInFlight = false;
    const bufferedJwt = consumeEmbeddedJwt();

    const tryJwtLogin = async (jwt: string): Promise<void> => {
      if (cancelled || loginInFlight) {
        return;
      }
      loginInFlight = true;
      try {
        await loginWithJwt(jwt);
        if (cancelled) {
          return;
        }
        const response = await getMe();
        if (cancelled) {
          return;
        }
        setAuth(response.user, response.tenant, response.csrfToken);
      } catch (jwtError) {
        // Intentionally ignore; backend will reject invalid/expired JWTs.
        if (import.meta.env.DEV) {
          console.warn("[auth] Embedded JWT login failed", jwtError);
        }
      } finally {
        loginInFlight = false;
      }
    };

    const handleMessage = (_event: MessageEvent): void => {
      if (cancelled) {
        return;
      }
      const jwt = consumeEmbeddedJwt();
      if (jwt) {
        void tryJwtLogin(jwt);
      }
    };

    const jwtCandidate = bufferedJwt;
    if (jwtCandidate) {
      void tryJwtLogin(jwtCandidate);
    }

    window.addEventListener("message", handleMessage);
    return () => {
      cancelled = true;
      window.removeEventListener("message", handleMessage);
    };
  }, [isEmbedded, isAuthenticated, setAuth]);

  useEffect(() => {
    const syncPendingCheckout = (): void => {
      setPendingCheckoutActive(hasPendingCheckout());
    };

    syncPendingCheckout();
    window.addEventListener(
      PENDING_CHECKOUT_CHANGED_EVENT,
      syncPendingCheckout,
    );

    return () => {
      window.removeEventListener(
        PENDING_CHECKOUT_CHANGED_EVENT,
        syncPendingCheckout,
      );
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const sessionIdFromUrl = params.get("session_id");
    const sessionId =
      sessionIdFromUrl ??
      window.sessionStorage.getItem(PENDING_CHECKOUT_SESSION_KEY);

    if (sessionIdFromUrl) {
      window.sessionStorage.setItem(
        PENDING_CHECKOUT_SESSION_KEY,
        sessionIdFromUrl,
      );
    }

    const handleCheckoutRedirect = async (): Promise<void> => {
      try {
        if (checkout === "cancel") {
          track("checkout_canceled");
          window.sessionStorage.removeItem(PENDING_CHECKOUT_SESSION_KEY);
          return;
        }

        if (checkout === "success" || sessionId) {
          if (checkout === "success") {
            track("checkout_completed");
          }

          if (sessionId) {
            for (let attempt = 0; attempt < 10; attempt += 1) {
              const result = await confirmCheckoutSession(sessionId);
              if (cancelled) {
                return;
              }

              if (result.status === "fulfilled") {
                toast.success("Welcome to Pro!", {
                  description: "All Pro features are now unlocked.",
                });
                window.sessionStorage.removeItem(PENDING_CHECKOUT_SESSION_KEY);
                void queryClient.invalidateQueries({
                  queryKey: featuresQueryKeys.all,
                });
                return;
              }

              if (result.status === "failed") {
                window.sessionStorage.removeItem(PENDING_CHECKOUT_SESSION_KEY);
                toast.error("Checkout did not complete", {
                  description:
                    result.reason === "expired"
                      ? "Your previous checkout session expired. Start checkout again."
                      : "Your previous checkout did not complete payment. Start checkout again.",
                });
                void queryClient.invalidateQueries({
                  queryKey: featuresQueryKeys.all,
                });
                return;
              }

              await delay(1500);
            }

            window.sessionStorage.removeItem(PENDING_CHECKOUT_SESSION_KEY);
            toast.message("Checkout is still processing", {
              description:
                "Payment succeeded, but billing is still syncing. Refresh in a moment if Pro does not appear.",
            });
            void queryClient.invalidateQueries({
              queryKey: featuresQueryKeys.all,
            });
            return;
          }

          toast.success("Welcome to Pro!", {
            description: "All Pro features are now unlocked.",
          });
          window.sessionStorage.removeItem(PENDING_CHECKOUT_SESSION_KEY);
          void queryClient.invalidateQueries({
            queryKey: featuresQueryKeys.all,
          });
        }
      } catch (error) {
        if (!cancelled) {
          toast.error("Unable to confirm checkout", {
            description:
              error instanceof Error
                ? error.message
                : "Billing is still syncing. Refresh in a moment.",
          });
        }
      }
    };

    void handleCheckoutRedirect();

    if (checkout) {
      params.delete("checkout");
      params.delete("session_id");
      const cleaned = params.toString();
      const newUrl =
        window.location.pathname +
        (cleaned ? `?${cleaned}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", newUrl);
    }

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  useEffect(() => {
    const handleCheckoutReturnSignal = (signal: CheckoutReturnSignal): void => {
      if (!hasPendingCheckout()) {
        return;
      }

      window.sessionStorage.removeItem(PENDING_CHECKOUT_SESSION_KEY);

      if (signal.status === "success") {
        clearPendingCheckout();
        closePricing();
        void queryClient.invalidateQueries({
          queryKey: featuresQueryKeys.all,
        });
        void queryClient.invalidateQueries({
          queryKey: usageQueryKeys.all,
        });

        if (isEmbedded) {
          window.location.reload();
          return;
        }

        toast.success("Welcome to Pro!", {
          description: "All Pro features are now unlocked.",
        });
        return;
      }

      clearPendingCheckout();

      if (signal.status === "canceled") {
        toast.message("Checkout canceled", {
          description:
            "No charges were made. Start checkout again whenever you are ready.",
        });
        return;
      }

      if (signal.status === "expired" || signal.status === "unpaid") {
        toast.error("Checkout did not complete", {
          description:
            signal.status === "expired"
              ? "Your previous checkout session expired. Start checkout again."
              : "Your previous checkout did not complete payment. Start checkout again.",
        });
        return;
      }

      toast.error("Unable to confirm checkout", {
        description:
          signal.status === "timeout"
            ? "Billing is still syncing. Refresh in a moment."
            : "We could not process this checkout. Try again from Marketing Cloud.",
      });
    };

    const handleMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (isCheckoutReturnSignalMessage(event.data)) {
        handleCheckoutReturnSignal(event.data.payload);
      }
    };

    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== CHECKOUT_RETURN_SIGNAL_STORAGE_KEY) {
        return;
      }

      const signal = parseCheckoutReturnSignal(event.newValue);
      if (signal) {
        handleCheckoutReturnSignal(signal);
      }
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
    };
  }, [closePricing, isEmbedded, queryClient]);

  useEffect(() => {
    if (!isAuthenticated || !pendingCheckoutActive) {
      return;
    }

    let cancelled = false;
    const pollStartedAt = Date.now();
    const maxPollingWindowMs = 30 * 60 * 1000;

    const getNextPollDelayMs = (attempt: number): number => {
      switch (attempt) {
        case 0:
          return 0;
        case 1:
          return 1500;
        case 2:
          return 3000;
        case 3:
          return 5000;
        case 4:
          return 10000;
        default:
          return 15000;
      }
    };

    const refreshPendingCheckout = async (): Promise<boolean> => {
      if (!hasPendingCheckout()) {
        setPendingCheckoutActive(false);
        return true;
      }

      try {
        const features = await queryClient.fetchQuery({
          queryKey: featuresQueryKeys.tenant(),
          queryFn: getTenantFeatures,
          staleTime: 0,
        });

        if (cancelled) {
          return true;
        }

        if (features.tier !== "free") {
          clearPendingCheckout();
          closePricing();
          if (isEmbedded) {
            window.location.reload();
            return true;
          }

          toast.success("Welcome to Pro!", {
            description: "All Pro features are now unlocked.",
          });
          return true;
        }
      } catch {
        if (cancelled) {
          return true;
        }
      }

      return false;
    };

    const runPollingLoop = async (): Promise<void> => {
      let attempt = 0;

      while (!cancelled && Date.now() - pollStartedAt < maxPollingWindowMs) {
        const waitMs = getNextPollDelayMs(attempt);
        if (waitMs > 0) {
          await delay(waitMs);
        }

        if (cancelled) {
          return;
        }

        const done = await refreshPendingCheckout();
        if (done) {
          return;
        }

        attempt += 1;
      }
    };

    const handleWindowFocus = (): void => {
      void refreshPendingCheckout();
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        void refreshPendingCheckout();
      }
    };

    const handlePageShow = (): void => {
      void refreshPendingCheckout();
    };

    const handleDocumentFocusIn = (): void => {
      void refreshPendingCheckout();
    };

    void runPollingLoop();

    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("focusin", handleDocumentFocusIn);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("focusin", handleDocumentFocusIn);
    };
  }, [
    closePricing,
    isAuthenticated,
    isEmbedded,
    pendingCheckoutActive,
    queryClient,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !pendingCheckoutActive) {
      return;
    }

    let refreshing = false;

    const handleInteraction = (): void => {
      if (refreshing || !hasPendingCheckout()) {
        return;
      }
      refreshing = true;
      void refreshOnInteraction();
    };

    const refreshOnInteraction = async (): Promise<void> => {
      try {
        const features = await queryClient.fetchQuery({
          queryKey: featuresQueryKeys.tenant(),
          queryFn: getTenantFeatures,
          staleTime: 0,
        });

        if (features.tier !== "free") {
          clearPendingCheckout();
          closePricing();
          if (isEmbedded) {
            window.location.reload();
            return;
          }
          toast.success("Welcome to Pro!", {
            description: "All Pro features are now unlocked.",
          });
          return;
        }
      } catch {
        // Will retry on next interaction
      }
      refreshing = false;
    };

    document.addEventListener("pointerdown", handleInteraction);
    document.addEventListener("keydown", handleInteraction);

    return () => {
      document.removeEventListener("pointerdown", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
  }, [
    closePricing,
    isAuthenticated,
    isEmbedded,
    pendingCheckoutActive,
    queryClient,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
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
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
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
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div className="flex items-center justify-center min-h-screen bg-destructive/5">
          <div className="p-8 max-w-md text-center space-y-4 border border-destructive/20 rounded-lg bg-background shadow-xl">
            <h2 className="text-xl font-bold text-destructive">
              Something went wrong
            </h2>
            <p className="text-muted-foreground text-sm">
              {error instanceof Error
                ? error.message
                : "An unexpected error occurred"}
            </p>
            <p className="text-xs text-muted-foreground">
              This error has been automatically reported.
            </p>
            <button
              onClick={resetError}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-10 px-4 py-2 hover:bg-primary/90"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    >
      <AppShell
        topNotice={(() => {
          if (bannerDismissed) {
            return undefined;
          }
          if (showCountdown && daysRemaining !== null) {
            return (
              <TrialBanner
                daysRemaining={daysRemaining}
                onViewPlans={() => openPricing("trial_banner")}
                onDismiss={() => setBannerDismissed(true)}
              />
            );
          }
          if (isTrialExpired) {
            return (
              <TrialExpiredBanner
                onViewPlans={() => openPricing("trial_banner")}
                onDismiss={() => setBannerDismissed(true)}
              />
            );
          }
          return undefined;
        })()}
        brandingExtra={
          import.meta.env.DEV ? <DevSubscriptionPanel /> : undefined
        }
        onSettingsClick={() => setCurrentView("settings")}
      >
        {currentView === "editor" ? (
          <EditorWorkspacePage />
        ) : (
          <SettingsPage onBack={() => setCurrentView("editor")} />
        )}
        <Toaster />
      </AppShell>
      <PricingOverlay />
    </Sentry.ErrorBoundary>
  );
}

export default App;
