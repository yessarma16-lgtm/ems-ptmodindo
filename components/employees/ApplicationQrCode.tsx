"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Loader2, Maximize2, Minimize2, QrCode as QrCodeIcon, RefreshCw, ZoomIn } from "lucide-react";

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
  fixedPath?: string;
  heading?: string;
  description?: string;
  /** Starts the box collapsed (e.g. on pages where the candidate list below matters more than the QR itself). */
  defaultCollapsed?: boolean;
  /** Which rotating-token flow this QR represents when `fixedPath` isn't set — picks the settings-token API and the /apply path prefix. Defaults to "walkin". */
  kind?: "walkin" | "new-hiring";
}

const QR_KIND_CONFIG = {
  walkin: { tokenEndpoint: "/api/settings/public-apply-token", applyPathPrefix: "/apply/walkin" },
  "new-hiring": { tokenEndpoint: "/api/settings/new-hiring-apply-token", applyPathPrefix: "/apply/new-hiring" },
} as const;

/**
 * Module-level cache (survives client-side navigation between pages, only
 * cleared by a hard page reload) — keyed by token, so the QR image is only
 * ever regenerated when the token itself actually changes. Without this, the
 * QR briefly re-flashed a loading spinner and redrew itself every single
 * time someone navigated to this page, even though the token — and
 * therefore the image — was identical to what was already showing.
 *
 * Keyed per `fixedPath` (Applicant Pool's token-based QR vs New Hiring's
 * fixed one, or any other fixedPath) — this component renders more than one
 * *kind* of QR across the app, and a single flat cache used to let whichever
 * kind was visited last clobber the other: navigating New Hiring -> Applicant
 * Pool client-side would briefly (or, if the token happened to already be
 * cached, indefinitely until a hard reload) show New Hiring's QR/URL on the
 * Applicant Pool page.
 */
type QrCacheEntry = { token: string | null; url: string | null; qrDataUrl: string | null };
const qrCache = new Map<string, QrCacheEntry>();
function getQrCacheEntry(cacheKey: string): QrCacheEntry {
  let entry = qrCache.get(cacheKey);
  if (!entry) {
    entry = { token: null, url: null, qrDataUrl: null };
    qrCache.set(cacheKey, entry);
  }
  return entry;
}

function getPublicOrigin(): string {
  const origin = window.location.origin;
  // Local testing: localhost in a QR code points back to the phone itself.
  // Use the laptop's LAN address while the app is running on port 3001.
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "http://192.168.43.198:3001";
  }
  return origin;
}

export function ApplicationQrCode({ canRegenerate = false, fixedPath, heading = "Walk-in Application QR Code", description, defaultCollapsed = false, kind = "walkin" }: ApplicationQrCodeProps) {
  const { tokenEndpoint, applyPathPrefix } = QR_KIND_CONFIG[kind];
  const cacheKey = fixedPath ?? kind;
  const [url, setUrl] = useState<string | null>(() => getQrCacheEntry(cacheKey).url);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(() => getQrCacheEntry(cacheKey).qrDataUrl);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

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
    const entry = getQrCacheEntry(cacheKey);
    if (fixedPath) {
      const fixedUrl = `${getPublicOrigin()}${fixedPath}`;
      if (entry.url !== fixedUrl) entry.qrDataUrl = null;
      entry.url = fixedUrl;
      setUrl(fixedUrl);
      return;
    }
    try {
      const res = await fetch(tokenEndpoint);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Unable to load the application QR code.");
        return;
      }
      // Same token as last time (the common case — nobody regenerated it) —
      // reuse what's cached instead of re-fetching/re-rendering the QR image.
      if (data.token === entry.token && entry.url) {
        setUrl(entry.url);
        return;
      }
      entry.token = data.token;
      entry.url = `${getPublicOrigin()}${applyPathPrefix}/${data.token}`;
      setUrl(entry.url);
    } catch {
      setError("Unable to connect to Employee Database.");
    }
  }, [fixedPath, cacheKey, tokenEndpoint, applyPathPrefix]);

  useEffect(() => {
    queueMicrotask(loadToken);
  }, [loadToken]);

  useEffect(() => {
    if (!url) return;
    const entry = getQrCacheEntry(cacheKey);
    if (url === entry.url && entry.qrDataUrl) {
      queueMicrotask(() => setQrDataUrl(entry.qrDataUrl));
      return;
    }
    queueMicrotask(() => {
      // Generated well above display size so the zoom dialog (and pinch/browser
      // zoom on the thumbnail) stays crisp instead of upscaling a blurry source.
      QRCode.toDataURL(url, { width: 512, margin: 1, errorCorrectionLevel: "H" })
        .then((dataUrl) => {
          entry.qrDataUrl = dataUrl;
          setQrDataUrl(dataUrl);
        })
        .catch(() => setError("Unable to render the QR code."));
    });
  }, [url, cacheKey]);

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
      const res = await fetch(`${tokenEndpoint}/regenerate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to regenerate the QR code.");
        return;
      }
      const entry = getQrCacheEntry(cacheKey);
      entry.token = data.token;
      entry.url = `${getPublicOrigin()}${applyPathPrefix}/${data.token}`;
      entry.qrDataUrl = null;
      setUrl(entry.url);
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
      <CardHeader
        className={`flex-row items-start justify-between gap-4 space-y-0 ${collapsed ? "cursor-pointer" : ""}`}
        onClick={collapsed ? () => setCollapsed(false) : undefined}
      >
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <QrCodeIcon className="size-5" />
            {heading}
          </CardTitle>
          <CardDescription>
            {description ?? "Satu QR code untuk semua pelamar. QR tetap sama sampai Administrator memilih Regenerate."}
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((c) => !c);
          }}
          title={collapsed ? "Maximize" : "Minimize"}
        >
          {collapsed ? <Maximize2 className="size-4" /> : <Minimize2 className="size-4" />}
        </Button>
      </CardHeader>
      {collapsed ? null : (
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
      )}

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="flex flex-col items-center gap-4 sm:max-w-md">
          <DialogHeader className="w-full">
            <DialogTitle>{heading}</DialogTitle>
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
              <DialogTitle>Regenerate this QR code?</DialogTitle>
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
