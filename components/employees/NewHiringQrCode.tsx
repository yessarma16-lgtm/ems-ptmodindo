"use client";

import { ApplicationQrCode } from "@/components/employees/ApplicationQrCode";

export function NewHiringQrCode({ canRegenerate = false }: { canRegenerate?: boolean }) {
  return (
    <ApplicationQrCode
      kind="new-hiring"
      heading="New Hiring QR Code"
      description="Satu QR code untuk semua pelamar New Hiring. QR tetap sama sampai Administrator memilih Regenerate."
      canRegenerate={canRegenerate}
      defaultCollapsed
    />
  );
}
