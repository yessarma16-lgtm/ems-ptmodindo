import { Database } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ConnectionTestCard } from "@/components/settings/ConnectionTestCard";
import { BackgroundWallpaperCard } from "@/components/settings/BackgroundWallpaperCard";
import { getDatabaseProvider } from "@/lib/database/database";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return <div>
    <PageHeader title="Database & Connection" description="Database connection and application configuration." breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings", href: "/settings" }, { label: "Database" }]} />
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><div className="space-y-6">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-4" />Database Provider</CardTitle><CardDescription>Postgres (Supabase) is the only runtime database provider.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center justify-between"><span className="text-muted-foreground">Provider</span><Badge variant="outline">{getDatabaseProvider()} / Supabase</Badge></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Environment</span><Badge variant="secondary">Production</Badge></div></CardContent></Card>
      <ConnectionTestCard /><BackgroundWallpaperCard />
      <Card><CardHeader><CardTitle>Environment Status</CardTitle><CardDescription>Supabase credentials are read on the server only.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center justify-between"><span className="text-muted-foreground">SUPABASE_URL</span><Badge variant={supabaseUrl ? "success" : "destructive"}>{supabaseUrl ? "Set" : "Missing"}</Badge></div><div className="flex items-center justify-between"><span className="text-muted-foreground">SUPABASE_SERVICE_ROLE_KEY</span><Badge variant={supabaseKey ? "success" : "destructive"}>{supabaseKey ? "Set" : "Missing"}</Badge></div></CardContent></Card>
    </div></div>
  </div>;
}
