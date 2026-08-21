"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Only the username is ever remembered client-side — never the password.
 * Storing a password in localStorage/cookies would be readable by any
 * script on the page (XSS risk) and in cleartext at rest; the browser's own
 * password manager (triggered by autoComplete="current-password" below)
 * already covers "remember my password" safely, outside the app's reach.
 */
const REMEMBERED_USERNAME_KEY = "met_remembered_username";

function LoginFormInner({ backgroundDataUri }: { backgroundDataUri?: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const saved = localStorage.getItem(REMEMBERED_USERNAME_KEY);
      if (saved) {
        setUsername(saved);
        setRememberMe(true);
      }
    });
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, rememberMe }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Unable to sign in.");
        return;
      }
      if (rememberMe) {
        localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
      } else {
        localStorage.removeItem(REMEMBERED_USERNAME_KEY);
      }
      const next = searchParams.get("next") || "/dashboard";
      router.push(next);
      router.refresh();
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {backgroundDataUri ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backgroundDataUri}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover blur-sm scale-105"
          />
          <div aria-hidden className="absolute inset-0 bg-[#0b0a1a]/70" />
        </>
      ) : (
        <>
          {/* Full-bleed soft-focus backdrop */}
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_22%,#0b0a1a)_0%,#0b0a1a_45%,color-mix(in_oklch,var(--primary)_16%,#0b0a1a)_100%)]"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,color-mix(in_oklch,var(--primary)_35%,transparent),transparent_50%),radial-gradient(circle_at_85%_80%,color-mix(in_oklch,var(--primary)_25%,transparent),transparent_55%)] blur-3xl"
          />
        </>
      )}

      <div className="relative w-full max-w-[420px]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/25 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="flex flex-col items-center gap-3 px-8 pb-6 pt-9">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-black/5">
              <Image src="/logo-mod.jpg" alt="PT MOD INDO" width={44} height={44} className="rounded-lg" />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold uppercase tracking-wide text-black">PT MOD INDO</p>
              <p className="mt-0.5 text-base text-black/70">Employee Management System</p>
            </div>
          </div>

          <div className="border-t border-border" />

          <form onSubmit={handleSubmit} className="space-y-5 px-8 py-7">
            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div>
              <Label htmlFor="login-username" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-black/70">
                User Name
              </Label>
              <Input
                id="login-username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
                autoFocus
                className="text-black"
              />
            </div>

            <div>
              <Label htmlFor="login-password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-black/70">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="pr-10 text-black"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-black">
                <Checkbox checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => toast.info("Please contact your administrator to reset your password.")}
                className="text-sm font-medium text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <LogIn />}
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="border-t border-border py-3 text-center text-xs text-black/60">
            © {new Date().getFullYear()} PT MOD INDO
          </p>
        </div>
      </div>
    </div>
  );
}

export function LoginForm({ backgroundDataUri }: { backgroundDataUri?: string | null }) {
  return (
    <Suspense fallback={null}>
      <LoginFormInner backgroundDataUri={backgroundDataUri} />
    </Suspense>
  );
}
