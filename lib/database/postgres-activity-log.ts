import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";

export interface ActivityLog {
  id: number;
  createdAt: string;
  user: string;
  activity: string;
}

export async function createActivityLog(user: string, activity: string): Promise<void> {
  await supabaseGuarded(async () => {
    const { error } = await getSupabaseClient().from("activity_logs").insert({ user_name: user || "System", activity });
    if (error) throw error;
  });
}

export async function getActivityLogs(limit = 100): Promise<ActivityLog[]> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient()
      .from("activity_logs")
      .select("id, created_at, user_name, activity")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500));
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: Number(row.id),
      createdAt: String(row.created_at),
      user: String(row.user_name ?? "System"),
      activity: String(row.activity ?? ""),
    }));
  });
}
