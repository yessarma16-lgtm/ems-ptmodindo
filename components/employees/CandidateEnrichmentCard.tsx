"use client";

import { useState } from "react";
import { Loader2, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ApplicantPreviousJob } from "@/lib/database/types";

export function CandidateEnrichmentCard({ applicantId }: { applicantId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [jobs, setJobs] = useState<ApplicantPreviousJob[]>([]);
  const [job, setJob] = useState({ companyName: "", startYear: "", endYear: "", lastPosition: "", description: "" });
  const [loadingJobs, setLoadingJobs] = useState(false);

  async function uploadCv() {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData(); body.set("applicant_id", applicantId); body.set("file", file);
      const response = await fetch("/api/ocr/upload", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "OCR gagal.");
      toast.success("CV berhasil dianalisis. Hasil OCR tidak menimpa data kandidat otomatis.");
      if (data.warning) toast.warning(data.warning);
    } catch (error) { toast.error(error instanceof Error ? error.message : "OCR gagal."); }
    finally { setUploading(false); }
  }

  async function loadJobs() {
    setLoadingJobs(true);
    try {
      const response = await fetch(`/api/new-hiring/previous-jobs?applicant_id=${encodeURIComponent(applicantId)}`);
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Gagal memuat riwayat pekerjaan.");
      setJobs(data.jobs ?? []);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal memuat riwayat pekerjaan."); }
    finally { setLoadingJobs(false); }
  }

  async function addJob() {
    const response = await fetch("/api/new-hiring/previous-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicant_id: applicantId, ...job, startYear: Number(job.startYear), endYear: job.endYear ? Number(job.endYear) : null }) });
    const data = await response.json();
    if (!response.ok) { toast.error(data.error ?? "Gagal menambahkan riwayat pekerjaan."); return; }
    setJobs((current) => [data.job, ...current]); setJob({ companyName: "", startYear: "", endYear: "", lastPosition: "", description: "" });
    toast.success("Riwayat pekerjaan ditambahkan.");
  }

  return <div className="grid gap-6 lg:grid-cols-2">
    <Card>
      <CardHeader><CardTitle>CV & OCR</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">PDF/JPG/PNG, maksimal 4 MB. Analisis hanya halaman 1–2.</p>
        <Input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <Button type="button" onClick={uploadCv} disabled={!file || uploading}><Upload /> {uploading ? <Loader2 className="animate-spin" /> : "Analyze CV"}</Button>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Previous Jobs</CardTitle><Button type="button" variant="outline" size="sm" onClick={loadJobs} disabled={loadingJobs}>{loadingJobs ? <Loader2 className="animate-spin" /> : "Load"}</Button></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2"><Input placeholder="Company" value={job.companyName} onChange={(e) => setJob({ ...job, companyName: e.target.value })} /><Input placeholder="Position" value={job.lastPosition} onChange={(e) => setJob({ ...job, lastPosition: e.target.value })} /><Input type="number" placeholder="Start year" value={job.startYear} onChange={(e) => setJob({ ...job, startYear: e.target.value })} /><Input type="number" placeholder="End year" value={job.endYear} onChange={(e) => setJob({ ...job, endYear: e.target.value })} /></div>
        <Textarea placeholder="Description" value={job.description} onChange={(e) => setJob({ ...job, description: e.target.value })} />
        <Button type="button" variant="outline" onClick={addJob} disabled={!job.companyName || !job.startYear}><Plus /> Add previous job</Button>
        {jobs.map((item) => <div key={item.id} className="rounded-md border p-2 text-sm"><div className="font-medium">{item.companyName} — {item.lastPosition}</div><div className="text-muted-foreground">{item.startYear}–{item.endYear ?? "Present"}</div>{item.description && <div>{item.description}</div>}</div>)}
      </CardContent>
    </Card>
  </div>;
}
