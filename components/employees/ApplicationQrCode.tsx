"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Loader2, QrCode as QrCodeIcon, RefreshCw, ZoomIn } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/**
 * Fixed, non-rotating QR code for walk-in applicants (poster/flyer use).
 * The token behind it never changes on its own — it's seeded once in
 * lib/database/sqlite-init.ts and only ever changes if HR explicitly clicks
 * "Regenerate" below (which invalidates every previously printed/shared copy).
 */
interface ApplicationQrCodeProps {
  /** Only Administrators can rotate the fixed token — everyone else sees the code as read-only. */
  canRegenerate?: boolean;
}

/**
 * Module-level cache (survives client-side navigation between pages, only
 * cleared by a hard page reload) — keyed by token, so the QR image is only
 * ever regenerated when the token itself actually changes. Without this, the
 * QR briefly re-flashed a loading spinner and redrew itself every single
 * time someone navigated to this page, even though the token — and
 * therefore the image — was identical to what was already showing.
 */
let cachedToken: string | null = null;
let cachedUrl: string | null = null;
let cachedQrDataUrl: string | null = null;

export function ApplicationQrCode({ canRegenerate = false }: ApplicationQrCodeProps) {
  const [url, setUrl] = useState<string | null>(cachedUrl);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(cachedQrDataUrl);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [customBg, setCustomBg] = useState<string | null>(null);

  const loadBackground = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/background/qr");
      const data = await res.json();
      if (res.ok) setCustomBg(data.dataUri ?? null);
    } catch {
      // Falls back to the default background image below — not worth surfacing an error for this.
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadBackground);
  }, [loadBackground]);

  const loadToken = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/settings/public-apply-token");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Unable to load the application QR code.");
        return;
      }
      // Same token as last time (the common case — nobody regenerated it) —
      // reuse what's cached instead of re-fetching/re-rendering the QR image.
      if (data.token === cachedToken && cachedUrl) {
        setUrl(cachedUrl);
        return;
      }
      cachedToken = data.token;
      cachedUrl = `${window.location.origin}/apply/walkin/${data.token}`;
      setUrl(cachedUrl);
    } catch {
      setError("Unable to connect to Employee Database.");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadToken);
  }, [loadToken]);

  useEffect(() => {
    if (!url) return;
    if (url === cachedUrl && cachedQrDataUrl) {
      queueMicrotask(() => setQrDataUrl(cachedQrDataUrl));
      return;
    }
    queueMicrotask(() => {
      // Generated well above display size so the zoom dialog (and pinch/browser
      // zoom on the thumbnail) stays crisp instead of upscaling a blurry source.
      QRCode.toDataURL(url, { width: 512, margin: 1, errorCorrectionLevel: "H" })
        .then((dataUrl) => {
          cachedQrDataUrl = dataUrl;
          setQrDataUrl(dataUrl);
        })
        .catch(() => setError("Unable to render the QR code."));
    });
  }, [url]);

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch("/api/settings/public-apply-token/regenerate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to regenerate the QR code.");
        return;
      }
      cachedToken = data.token;
      cachedUrl = `${window.location.origin}/apply/walkin/${data.token}`;
      cachedQrDataUrl = null;
      setUrl(cachedUrl);
      toast.success("QR code regenerated — any previously printed copy no longer works.");
      setConfirmOpen(false);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <Card className="relative mb-6 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 -z-10 bg-cover bg-center opacity-25 blur-md"
        style={{ backgroundImage: `url(${customBg ?? "/qr-section-bg.jpg"})` }}
      />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCodeIcon className="size-5" />
          Walk-in Application QR Code
        </CardTitle>
        <CardDescription>
          A fixed code for posters/flyers — any applicant can scan it to apply. It stays the same until you
          explicitly regenerate it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4" />
            {error}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {qrDataUrl ? (
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                title="Click to enlarge"
                className="group relative size-[140px] shrink-0 rounded-md border border-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="Walk-in application QR code" width={140} height={140} className="rounded-md" />
                <div className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md bg-white p-1 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-mod.jpg" alt="PT MOD INDO" className="size-full rounded-sm object-cover" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                  <ZoomIn className="size-6 text-white" />
                </div>
              </button>
            ) : (
              <div className="flex size-[140px] items-center justify-center rounded-md border border-border bg-muted">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Input value={url ?? ""} readOnly className="bg-muted" />
                <Button type="button" variant="outline" size="sm" onClick={handleCopy} disabled={!url}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              {canRegenerate && (
                <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmOpen(true)} disabled={!url}>
                  <RefreshCw />
                  Regenerate
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="flex flex-col items-center gap-4 sm:max-w-md">
          <DialogHeader className="w-full">
            <DialogTitle>Walk-in Application QR Code</DialogTitle>
            <DialogDescription>Scan with a phone camera to open the application form.</DialogDescription>
          </DialogHeader>
          {qrDataUrl && (
            <div className="relative size-[320px] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="Walk-in application QR code"
                width={320}
                height={320}
                className="rounded-md border border-border"
              />
              <div className="absolute left-1/2 top-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-white p-2 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-mod.jpg" alt="PT MOD INDO" className="size-full rounded-md object-cover" />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {canRegenerate && (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Regenerate the walk-in QR code?</DialogTitle>
              <DialogDescription>
                Any QR code already printed on a poster/flyer, or link already shared, will stop working immediately.
                Only do this if the current code needs to be invalidated (e.g. it was misused or leaked).
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={regenerating}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={handleRegenerate} disabled={regenerating}>
                {regenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Regenerate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
