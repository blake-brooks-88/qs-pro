import { CheckCircle, CloseCircle } from "@solar-icons/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { confirmCheckoutSession } from "@/services/billing";

type Status = "confirming" | "success" | "failed" | "canceled";

const AUTO_CLOSE_DELAY_MS = 4000;

function tryCloseWindow(): void {
  try {
    window.close();
  } catch {
    // Browser may block window.close() if not opened via window.open
  }
}

export function CheckoutReturnPage() {
  const [status, setStatus] = useState<Status>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("checkout") === "cancel" ? "canceled" : "confirming";
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    if (params.get("checkout") === "cancel" || !sessionId) {
      setStatus(sessionId ? "confirming" : "canceled");
      if (!sessionId && params.get("checkout") !== "cancel") {
        setStatus("failed");
      }
      return;
    }

    let cancelled = false;

    const confirm = async (): Promise<void> => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (cancelled) {
          return;
        }

        try {
          const result = await confirmCheckoutSession(sessionId);

          if (cancelled) {
            return;
          }

          if (result.status === "fulfilled") {
            setStatus("success");
            return;
          }

          if (result.status === "failed") {
            setStatus("failed");
            return;
          }
        } catch {
          if (cancelled) {
            return;
          }
        }

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 2000);
        });
      }

      if (!cancelled) {
        setStatus("success");
      }
    };

    void confirm();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "success") {
      return;
    }

    const timeout = window.setTimeout(tryCloseWindow, AUTO_CLOSE_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [status]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center px-6">
        <StatusIcon status={status} />
        <StatusContent status={status} />
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "confirming") {
    return (
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    );
  }

  if (status === "success") {
    return (
      <div className="rounded-full bg-emerald-500/10 p-3">
        <CheckCircle size={48} weight="Bold" className="text-emerald-500" />
      </div>
    );
  }

  if (status === "canceled") {
    return (
      <div className="rounded-full bg-muted p-3">
        <CloseCircle
          size={48}
          weight="Bold"
          className="text-muted-foreground"
        />
      </div>
    );
  }

  return (
    <div className="rounded-full bg-amber-500/10 p-3">
      <CheckCircle size={48} weight="Bold" className="text-amber-500" />
    </div>
  );
}

function StatusContent({ status }: { status: Status }) {
  if (status === "confirming") {
    return (
      <>
        <h1 className="text-xl font-semibold">Confirming your payment...</h1>
        <p className="text-sm text-muted-foreground">
          This should only take a moment.
        </p>
      </>
    );
  }

  if (status === "success") {
    return (
      <>
        <h1 className="text-xl font-semibold">You&apos;re on Pro!</h1>
        <p className="text-sm text-muted-foreground">
          Payment confirmed. Return to Marketing Cloud to start using your new
          features.
        </p>
        <p className="text-xs text-muted-foreground">
          This tab will close automatically.
        </p>
        <Button variant="secondary" onClick={tryCloseWindow}>
          Close this tab
        </Button>
      </>
    );
  }

  if (status === "canceled") {
    return (
      <>
        <h1 className="text-xl font-semibold">Checkout canceled</h1>
        <p className="text-sm text-muted-foreground">
          No charges were made. You can close this tab and return to Marketing
          Cloud.
        </p>
        <Button variant="secondary" onClick={tryCloseWindow}>
          Close this tab
        </Button>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Payment is processing</h1>
      <p className="text-sm text-muted-foreground">
        Your payment went through, but billing is still syncing. Return to
        Marketing Cloud — your plan will update shortly.
      </p>
      <Button variant="secondary" onClick={tryCloseWindow}>
        Close this tab
      </Button>
    </>
  );
}
