import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function TwoFactorSetupPage() {
  const navigate = useNavigate();
  const [totpURI, setTotpURI] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"password" | "scan" | "backup">("password");

  const handleEnableTwoFactor = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        const result = await authClient.twoFactor.enable({ password });

        if (result.error) {
          setError(result.error.message ?? "Failed to enable 2FA");
          return;
        }

        if (result.data?.totpURI) {
          setTotpURI(result.data.totpURI);
          if (result.data.backupCodes) {
            setBackupCodes(result.data.backupCodes);
          }
          setStep("scan");
        }
      } catch {
        toast.error("Failed to enable 2FA. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [password],
  );

  const handleVerifyCode = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        const result = await authClient.twoFactor.verifyTotp({ code });

        if (result.error) {
          setError(result.error.message ?? "Invalid code");
          setCode("");
          return;
        }

        await authClient.getSession({ fetchOptions: { throw: true } });

        if (backupCodes.length > 0) {
          setStep("backup");
        } else {
          navigate("/");
        }
      } catch {
        toast.error("Verification failed. Please try again.");
        setCode("");
      } finally {
        setLoading(false);
      }
    },
    [code, backupCodes, navigate],
  );

  const handleCopyBackupCodes = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      toast.success("Backup codes copied to clipboard");
    } catch {
      toast.error("Failed to copy. Please copy manually.");
    }
  }, [backupCodes]);

  if (step === "backup") {
    return (
      <Card className="border-border/50">
        <CardHeader className="text-center">
          <CardTitle className="font-heading text-2xl">Backup Codes</CardTitle>
          <CardDescription>
            Save these codes securely. They can only be viewed once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-4 font-mono text-sm">
            {backupCodes.map((bc) => (
              <span key={bc}>{bc}</span>
            ))}
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={handleCopyBackupCodes}
          >
            Copy Backup Codes
          </Button>

          <Button
            className="w-full"
            onClick={async () => {
              await authClient.getSession({ fetchOptions: { throw: true } });
              navigate("/");
            }}
          >
            Continue to Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "scan") {
    return (
      <Card className="border-border/50">
        <CardHeader className="text-center">
          <CardTitle className="font-heading text-2xl">Scan QR Code</CardTitle>
          <CardDescription>
            Scan with your authenticator app, then enter the code below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="rounded-md border border-border bg-white p-3">
                <QRCodeSVG value={totpURI} size={192} />
              </div>
            </div>

            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="verification-code"
                  className="text-sm font-medium text-foreground"
                >
                  Verification Code
                </label>
                <Input
                  id="verification-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.3em]"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || code.length !== 6}
              >
                {loading ? "Verifying..." : "Verify & Complete Setup"}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="text-center">
        <CardTitle className="font-heading text-2xl">
          Set Up Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Enter your password to begin 2FA setup
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleEnableTwoFactor} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="setup-password"
              className="text-sm font-medium text-foreground"
            >
              Password
            </label>
            <Input
              id="setup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Setting up..." : "Continue to 2FA Setup"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
