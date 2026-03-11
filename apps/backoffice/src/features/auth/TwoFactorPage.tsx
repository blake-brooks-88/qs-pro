import { type ChangeEvent, type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

export function TwoFactorPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleVerify(codeValue: string) {
    if (codeValue.length !== 6) {
      return;
    }
    setError("");
    setLoading(true);

    try {
      const result = await authClient.twoFactor.verifyTotp({ code: codeValue });

      if (result.error) {
        setError(result.error.message ?? "Invalid code");
        setCode("");
        return;
      }

      navigate("/");
    } catch {
      toast.error("Network error. Please try again.");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(value);
    if (value.length === 6) {
      void handleVerify(value);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void handleVerify(code);
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="text-center">
        <CardTitle className="font-heading text-2xl">
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Enter the 6-digit code from your authenticator app
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={handleChange}
              placeholder="000000"
              className="text-center text-2xl tracking-[0.5em]"
              autoFocus
              autoComplete="one-time-code"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || code.length !== 6}
          >
            {loading ? "Verifying..." : "Verify"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">
              Back to login
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
