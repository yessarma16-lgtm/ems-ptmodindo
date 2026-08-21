import { BookOpen, Database } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ConnectionTestCard } from "@/components/settings/ConnectionTestCard";
import { BackgroundWallpaperCard } from "@/components/settings/BackgroundWallpaperCard";
import { EMPLOYEE_FIELDS, SYSTEM_FIELDS, EMPLOYEES_SHEET_NAME } from "@/config/employee-fields";
import { isGoogleSheetsConfigured } from "@/lib/google-sheets";
import { getDatabaseProvider } from "@/lib/database/database";
import { getDbPath } from "@/lib/database/sqlite-init";
import { Badge } from "@/components/ui/badge";

const PROVIDER_LABEL: Record<ReturnType<typeof getDatabaseProvider>, string> = {
  sqlite: "SQLite",
  google: "Google Sheets",
  postgres: "Postgres (Supabase)",
};

export default function SettingsPage() {
  const provider = getDatabaseProvider();
  const environment = provider === "sqlite" ? "Development" : "Production";
  const configured = isGoogleSheetsConfigured();
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return (
    <div>
      <PageHeader
        title="Database & Connection"
        description="Database connection and application configuration."
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Database" },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="size-4" />
                Database Provider
              </CardTitle>
              <CardDescription>
                Set via <code className="rounded bg-muted px-1 py-0.5">DATABASE_PROVIDER</code> in{" "}
                <code className="rounded bg-muted px-1 py-0.5">.env.local</code>. Centralized in{" "}
                <code className="rounded bg-muted px-1 py-0.5">lib/database/database.ts</code> — nothing
                else in the app knows which provider is active.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Provider</span>
                <Badge variant={provider === "sqlite" ? "success" : "outline"}>
                  {PROVIDER_LABEL[provider]}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Environment</span>
                <Badge variant="secondary">{environment}</Badge>
              </div>
              {provider === "sqlite" && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Database file</span>
                  <code className="truncate rounded bg-muted px-1.5 py-0.5 text-xs">{getDbPath()}</code>
                </div>
              )}
              {provider === "google" && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Spreadsheet ID</span>
                  <Badge variant={spreadsheetId ? "success" : "destructive"}>
                    {spreadsheetId ? "Set" : "Missing"}
                  </Badge>
                </div>
              )}
              {provider === "postgres" && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Supabase URL</span>
                  <Badge variant={supabaseUrl ? "success" : "destructive"}>
                    {supabaseUrl ? "Set" : "Missing"}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <ConnectionTestCard />

          <BackgroundWallpaperCard />

          {provider === "google" && (
            <Card>
              <CardHeader>
                <CardTitle>Environment Status</CardTitle>
                <CardDescription>
                  Credentials are read from <code className="rounded bg-muted px-1 py-0.5">.env.local</code>{" "}
                  on the server only — never exposed to the browser.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">GOOGLE_SHEETS_SPREADSHEET_ID</span>
                  <Badge variant={spreadsheetId ? "success" : "destructive"}>
                    {spreadsheetId ? "Set" : "Missing"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">GOOGLE_SERVICE_ACCOUNT_EMAIL</span>
                  <Badge variant={serviceAccountEmail ? "success" : "destructive"}>
                    {serviceAccountEmail ? "Set" : "Missing"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">GOOGLE_PRIVATE_KEY</span>
                  <Badge variant={configured ? "success" : "destructive"}>
                    {configured ? "Set" : "Missing"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {provider === "postgres" && (
            <Card>
              <CardHeader>
                <CardTitle>Environment Status</CardTitle>
                <CardDescription>
                  Credentials are read from <code className="rounded bg-muted px-1 py-0.5">.env.local</code>{" "}
                  on the server only — never exposed to the browser.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">SUPABASE_URL</span>
                  <Badge variant={supabaseUrl ? "success" : "destructive"}>
                    {supabaseUrl ? "Set" : "Missing"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">SUPABASE_SERVICE_ROLE_KEY</span>
                  <Badge variant={supabaseServiceRoleKey ? "success" : "destructive"}>
                    {supabaseServiceRoleKey ? "Set" : "Missing"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="size-4" />
                Setup Guide
              </CardTitle>
              <CardDescription>
                Step-by-step guide to create your Google Cloud project, Service Account, and
                connect your production Employee Database spreadsheet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Open{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">docs/GOOGLE_SHEETS_SETUP.md</code>{" "}
                in your VS Code workspace for the full walkthrough.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Employee Master Schema</CardTitle>
            <CardDescription>
              {EMPLOYEE_FIELDS.length} fields from <code className="rounded bg-muted px-1 py-0.5">db_mod.xlsx</code> +{" "}
              {SYSTEM_FIELDS.length} system fields. Written to the{" "}
              <span className="font-medium text-foreground">{EMPLOYEES_SHEET_NAME}</span> sheet (Google) or
              the <span className="font-medium text-foreground">employees</span> table (SQLite / Postgres).
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-xs uppercase text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-2 text-left">Col</th>
                  <th className="py-2 pr-2 text-left">Label</th>
                  <th className="py-2 text-left">Key</th>
                </tr>
              </thead>
              <tbody>
                {[...EMPLOYEE_FIELDS, ...SYSTEM_FIELDS].map((f) => (
                  <tr key={f.key} className="border-b border-border/60">
                    <td className="py-1.5 pr-2 text-muted-foreground">{f.spreadsheetColumn}</td>
                    <td className="py-1.5 pr-2">{f.label}</td>
                    <td className="py-1.5 font-mono text-xs text-muted-foreground">{f.key}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
