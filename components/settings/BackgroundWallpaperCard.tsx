"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Loader2, RotateCcw, Upload } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Surface = "login" | "qr" | "apply";

const SURFACES: { key: Surface; label: string; description: string }[] = [
  { key: "login", label: "Login Page", description: "Background behind the sign-in card." },
  { key: "qr", label: "Walk-in QR Code Section", description: "Background behind the QR code on the Recruitment page." },
  { key: "apply", label: "Candidate Application Link", description: "Background on the public /apply pages candidates fill in." },
];

function UploadSlot({ surface, label, description }: { surface: Surface; label: string; description: string }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/settings/background/${surface}`);
      const data = await res.json();
      if (res.ok) setCurrent(data.dataUri ?? null);
    } finally {
      setLoading(false);
    }
  }, [surface]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/settings/background/${surface}`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to upload image.");
        return;
      }
      setCurrent(data.dataUri);
      toast.success("Background updated.");
      setLightboxOpen(false);
    } catch {
      toast.error("Unable to connect to Employee Database.");
    } finally {
      setUploading(false);
    }
  }

  async function handleReset() {
    setUploading(true);
    try {
      const res = await fetch(`/api/settings/background/${surface}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to reset background.");
        return;
      }
      setCurrent(null);
      toast.success("Reverted to the default background.");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
      <div className="flex items-center gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
          <p className="text-xs text-muted-foreground">{current ? "Custom background set" : "Using default"}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {current && (
          <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={uploading}>
            <RotateCcw />
            Reset
          </Button>
        )}
        <Button type="button" variant="secondary" size="sm" onClick={() => setLightboxOpen(true)}>
          <Upload />
          Change
        </Button>
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="border-white/10 bg-card/70 backdrop-blur-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload background — {label}</DialogTitle>
            <DialogDescription>{description} JPEG/PNG, any size — it&apos;s compressed automatically.</DialogDescription>
          </DialogHeader>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
              dragOver ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
              }}
            />
            {uploading ? (
              <>
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Uploading…</p>
              </>
            ) : (
              <>
                <Upload className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">Drag & drop a photo here</p>
                <p className="text-xs text-muted-foreground">or click to browse</p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BackgroundWallpaperCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="size-4" />
          Background Wallpaper
        </CardTitle>
        <CardDescription>
          Upload a custom photo for each page below. Leave any of them unset to keep the default look.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {SURFACES.map((s) => (
          <UploadSlot key={s.key} surface={s.key} label={s.label} description={s.description} />
        ))}
      </CardContent>
    </Card>
  );
}
