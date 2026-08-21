"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface HealthResponse {
  status: "ok" | "error";
  database: { provider: "sqlite" | "google" | "postgres"; connected: boolean };
  environment: "Development" | "Production";
  spreadsheet?: { title: string; sheets: string[] };
  error?: string;
}

const PROVIDER_LABEL: Record<HealthResponse["database"]["provider"], string> = {
  sqlite: "SQLite",
  google: "Google Sheets",
  postgres: "Postgres (Supabase)",
};

export function ConnectionTestCard() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResponse | null>(null);

  async function testConnection() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const data = (await res.json()) as HealthResponse;
      setResult(data);
    } catch {
      setResult({
        status: "error",
        database: { provider: "sqlite", connected: false },
        environment: "Development",
        error: "Unable to connect to Employee Database.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlugZap className="size-4" />
          Database Connection
        </CardTitle>
        <CardDescription>Test whether this app can reach the active Employee Database.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={testConnection} disabled={loading} variant="outline">
          {loading ? <Loader2 className="animate-spin" /> : <PlugZap />}
          Test Connection
        </Button>

        {result && (
          <div className="rounded-lg border border-border p-4 text-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline">Provider: {PROVIDER_LABEL[result.database.provider]}</Badge>
              <Badge variant="outline">Environment: {result.environment}</Badge>
            </div>

            {result.status === "ok" ? (
              <div className="flex items-start gap-2 text-success">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-medium">Connected successfully</p>
                  {result.spreadsheet && (
                    <>
                      <p className="mt-1 text-muted-foreground">
                        Spreadsheet: <span className="text-foreground">{result.spreadsheet.title}</span>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {result.spreadsheet.sheets.map((s) => (
                          <Badge key={s} variant="secondary">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-destructive">
                <XCircle className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-medium">Database: disconnected</p>
                  {result.error && <p className="mt-1 text-muted-foreground">{result.error}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
