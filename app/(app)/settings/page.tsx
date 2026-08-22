import { Database } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ConnectionTestCard } from "@/components/settings/ConnectionTestCard";
import { BackgroundWallpaperCard } from "@/components/settings/BackgroundWallpaperCard";
import { getDatabaseProvider } from "@/lib/database/database";
import { isLocalPostgresConfigured } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityLogTab } from "@/components/settings/ActivityLogTab";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { isDeveloperUser } from "@/lib/auth/developer-access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentSessionUser();
  if (!isDeveloperUser(user)) redirect("/dashboard");
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return <div>
    <PageHeader title="Database & Connection" description="Database connection and application configuration." breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings", href: "/settings" }, { label: "Database" }]} />
    <Tabs defaultValue="database">
      <TabsList><TabsTrigger value="database">Database</TabsTrigger><TabsTrigger value="activity">Activity Log</TabsTrigger></TabsList>
      <TabsContent value="database"><div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><div className="space-y-6">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-4" />Database Provider</CardTitle><CardDescription>PostgreSQL direct untuk lokal, Supabase REST untuk production.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center justify-between"><span className="text-muted-foreground">Provider</span><Badge variant="outline">{getDatabaseProvider()} / {isLocalPostgresConfigured() ? "Direct PostgreSQL" : "Supabase REST"}</Badge></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Environment</span><Badge variant="secondary">{isLocalPostgresConfigured() ? "Local" : "Production"}</Badge></div></CardContent></Card>
      <ConnectionTestCard /><BackgroundWallpaperCard />
      <Card><CardHeader><CardTitle>Environment Status</CardTitle><CardDescription>Credentials database hanya dibaca di server.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center justify-between"><span className="text-muted-foreground">DATABASE_URL</span><Badge variant={isLocalPostgresConfigured() ? "success" : "secondary"}>{isLocalPostgresConfigured() ? "Set" : "Not set"}</Badge></div><div className="flex items-center justify-between"><span className="text-muted-foreground">SUPABASE_URL</span><Badge variant={supabaseUrl ? "success" : "secondary"}>{supabaseUrl ? "Set" : "Not set"}</Badge></div><div className="flex items-center justify-between"><span className="text-muted-foreground">SUPABASE_SERVICE_ROLE_KEY</span><Badge variant={supabaseKey ? "success" : "secondary"}>{supabaseKey ? "Set" : "Not set"}</Badge></div></CardContent></Card>
      </div></div></TabsContent>
      <TabsContent value="activity"><ActivityLogTab /></TabsContent>
    </Tabs>
  </div>;
}
