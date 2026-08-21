import { HelpCircle } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export default function HelpPage() {
  return (
    <div>
      <PageHeader
        title="Help & Support"
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Help & Support" }]}
      />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HelpCircle className="size-7" />
          </div>
          <h2 className="text-lg font-semibold">Need help?</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            For Google Spreadsheet connection issues, see{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">docs/GOOGLE_SHEETS_SETUP.md</code> or
            check the connection status on the{" "}
            <a href="/settings" className="text-primary underline underline-offset-2">
              Settings
            </a>{" "}
            page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
