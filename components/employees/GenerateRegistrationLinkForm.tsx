"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Check, Copy, Link2, Loader2 } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { SelectOption } from "@/lib/master-data-options";

interface GenerateRegistrationLinkFormProps {
  positionOptions: SelectOption[];
}

export function GenerateRegistrationLinkForm({ positionOptions }: GenerateRegistrationLinkFormProps) {
  const [name, setName] = useState("");
  const [hpNumber, setHpNumber] = useState("");
  const [position, setPosition] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});

    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Name is required";
    if (!hpNumber.trim()) nextErrors.hpNumber = "HP Number is required";
    if (!position.trim()) nextErrors.position = "Position is required";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/online-register/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, hpNumber, position }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to generate link.");
        return;
      }
      setLink(`${window.location.origin}/apply/${data.token}`);
      toast.success("Application link generated.");
    } catch {
      toast.error("Unable to connect to Employee Database.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleGenerateAnother() {
    setName("");
    setHpNumber("");
    setPosition("");
    setLink(null);
  }

  if (link) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>Application link ready</CardTitle>
          <CardDescription>
            Share this link with {name} — it lets them apply for {position}. The link is unique to this candidate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input value={link} readOnly className="bg-muted" />
            <Button type="button" variant="outline" onClick={handleCopy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button type="button" variant="secondary" onClick={handleGenerateAnother}>
            Generate another link
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Generate application link</CardTitle>
        <CardDescription>
          Fill in the candidate&apos;s Name, HP Number, and Position, then generate a shareable link. The candidate
          uses the link to complete the rest of their application themselves.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <Label htmlFor="invite-name" className="mb-1.5 block">
              Name<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>

          <div>
            <Label htmlFor="invite-hp" className="mb-1.5 block">
              HP Number<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input id="invite-hp" value={hpNumber} onChange={(e) => setHpNumber(e.target.value)} />
            {errors.hpNumber && <p className="mt-1 text-xs text-destructive">{errors.hpNumber}</p>}
          </div>

          <div>
            <Label htmlFor="invite-position" className="mb-1.5 block">
              Position<span className="ml-0.5 text-destructive">*</span>
            </Label>
            {positionOptions.length > 0 ? (
              <Select value={position || undefined} onValueChange={setPosition}>
                <SelectTrigger id="invite-position">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {positionOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="invite-position"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="No positions in Master Data — type one"
              />
            )}
            {errors.position && <p className="mt-1 text-xs text-destructive">{errors.position}</p>}
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <Link2 />}
            Generate Link
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
