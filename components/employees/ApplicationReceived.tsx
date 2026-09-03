import { BadgeCheck, BellRing, Briefcase, Calendar, Check, ClipboardList, FileCheck2, ShieldCheck } from "lucide-react";

interface ApplicationReceivedProps {
  applicationDate: string;
  applicationId: string;
  positionApplied: string;
  candidateNumber?: string;
  /** Applicant Pool has no NIK/Application-ID login, so the code is just noise there — New Hiring's lookup feature relies on it, so it stays visible by default. */
  showApplicationId?: boolean;
  language?: "en" | "id";
}

const REQUIRED_DOCUMENTS: { label: string; qty: string }[] = [
  { label: "Surat Lamaran Pekerjaan (Application Letter)", qty: "1 lembar" },
  { label: "Curriculum Vitae (CV / Riwayat Hidup)", qty: "1 lembar" },
  { label: "Copy Kartu Keluarga (Family Card)", qty: "3 lembar" },
  { label: "Copy Ijazah (Education Certificate)", qty: "1 lembar" },
  { label: "Copy KTP (Identity Card)", qty: "3 lembar" },
  { label: "Pas Foto 3x4 (2) dan 4x6 (2)", qty: "2 lembar masing-masing" },
  { label: "Copy Surat Pengalaman Kerja (Work Experience Letter)", qty: "1 lembar" },
  { label: "SKCK (Police Clearance Certificate)", qty: "1 lembar" },
  { label: "Surat Keterangan Dokter / Medical Report (dari klinik/puskesmas)", qty: "1 lembar" },
  { label: "Copy BPJS Kesehatan dan BPJS Ketenagakerjaan", qty: "1 lembar" },
];

/** Shown after a successful public apply/walk-in submission (and again if the candidate revisits the link) — same design for both entry points. */
export function ApplicationReceived({ applicationDate, applicationId, positionApplied, candidateNumber, showApplicationId = true, language = "en" }: ApplicationReceivedProps) {
  const id = language === "id";
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="relative mb-4 flex justify-center">
        <span className="absolute -top-1 left-[38%] size-2 rounded-full bg-sky-400" />
        <span className="absolute top-2 right-[32%] size-1.5 rounded-full bg-amber-400" />
        <span className="absolute bottom-1 left-[30%] size-1.5 rounded-full bg-violet-400" />
        <span className="absolute bottom-3 right-[36%] size-2 rounded-full bg-emerald-400" />
        <div className="flex size-20 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60 dark:bg-emerald-950/40 dark:ring-emerald-950/20">
          <Check className="size-10 text-emerald-600" strokeWidth={3} />
        </div>
      </div>

      <h1 className="text-center text-2xl font-bold text-foreground sm:text-3xl">{id ? "Terima kasih — lamaran telah diterima!" : "Thank you — application received!"}</h1>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted-foreground">
        {id ? "Lamaran Anda telah berhasil dikirim ke HR PT MOD INDO." : "Your application has been successfully submitted to HR PT MOD INDO."}
      </p>

      <div className={`mt-8 grid grid-cols-1 gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm ${showApplicationId ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <SummaryItem icon={<Calendar className="size-5 text-sky-600" />} iconBg="bg-sky-50 dark:bg-sky-950/40" label={id ? "Tanggal Lamaran" : "Application Date"} value={applicationDate} />
        {showApplicationId && (
          <SummaryItem icon={<BadgeCheck className="size-5 text-emerald-600" />} iconBg="bg-emerald-50 dark:bg-emerald-950/40" label={id ? "ID Lamaran" : "Application ID"} value={applicationId} />
        )}
        <SummaryItem icon={<BadgeCheck className="size-5 text-amber-600" />} iconBg="bg-amber-50 dark:bg-amber-950/40" label={id ? "Nomor Kandidat" : "Candidate Number"} value={candidateNumber ?? ""} valueClassName="text-lg" />
        <SummaryItem icon={<Briefcase className="size-5 text-violet-600" />} iconBg="bg-violet-50 dark:bg-violet-950/40" label={id ? "Posisi yang Dilamar" : "Position Applied"} value={positionApplied} />
      </div>

      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 dark:border-emerald-900 dark:bg-emerald-950/20">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600">
            <ClipboardList className="size-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">{id ? "Siapkan dan Bawa Dokumen Berikut:" : "Prepare and Bring Your Documents:"}</h2>
            <p className="text-sm text-muted-foreground">
              {id ? "Silakan siapkan dan bawa dokumen berikut untuk mendukung proses rekrutmen Anda." : "Please prepare and bring the following documents to support your recruitment process."}
            </p>
          </div>
        </div>

        <ol className="mt-4 divide-y divide-emerald-200/70 dark:divide-emerald-900/70">
          {REQUIRED_DOCUMENTS.map((doc, idx) => (
            <li key={doc.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <span className="flex items-center gap-3">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                  {idx + 1}
                </span>
                <span className="text-foreground">{doc.label}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">{doc.qty}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-6 dark:border-amber-900 dark:bg-amber-950/20">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
          <BellRing className="size-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-foreground">{id ? "Pengingat Penting" : "Important Reminder"}</h2>
          <p className="text-sm text-muted-foreground">
            {id ? "Bawa dokumen asli dan fotokopi sesuai kebutuhan untuk verifikasi selama proses rekrutmen." : "Please bring the original documents and photocopies where required for verification during the recruitment process."}
          </p>
        </div>
        <FileCheck2 className="hidden size-10 shrink-0 text-amber-500 sm:block" />
      </div>

      <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" />
        {id ? "Informasi Anda aman bersama kami. PT MOD INDO berkomitmen melindungi data pribadi Anda." : "Your information is secure with us. PT MOD INDO is committed to protecting your personal data."}
      </p>
    </div>
  );
}

function SummaryItem({
  icon,
  iconBg,
  label,
  value,
  valueClassName = "",
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className={`mb-2 flex size-10 items-center justify-center rounded-full ${iconBg}`}>{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-semibold text-foreground ${valueClassName}`}>{value || "—"}</p>
    </div>
  );
}
