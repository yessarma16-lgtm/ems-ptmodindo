import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";

export interface ActivityLog {
  id: number;
  createdAt: string;
  user: string;
  activity: string;
}

export interface ActivityLogPage {
  logs: ActivityLog[];
  total: number;
  page: number;
  pageSize: number;
}

export const ACTIVITY_LOG_PAGE_SIZE = 100;
const ACTIVITY_LOG_RETENTION_DAYS = 14;

function retentionCutoff() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ACTIVITY_LOG_RETENTION_DAYS);
  return cutoff.toISOString();
}

async function removeExpiredActivityLogs() {
  const { error } = await getSupabaseClient()
    .from("activity_logs")
    .delete()
    .lt("created_at", retentionCutoff());
  if (error) throw error;
}

export async function createActivityLog(user: string, activity: string): Promise<void> {
  await supabaseGuarded(async () => {
    await removeExpiredActivityLogs();
    const { error } = await getSupabaseClient().from("activity_logs").insert({ user_name: user || "System", activity });
    if (error) throw error;
  });
}

export async function getActivityLogs(page = 1): Promise<ActivityLogPage> {
  return supabaseGuarded(async () => {
    await removeExpiredActivityLogs();
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const from = (safePage - 1) * ACTIVITY_LOG_PAGE_SIZE;
    const { data, error, count } = await getSupabaseClient()
      .from("activity_logs")
      .select("id, created_at, user_name, activity", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + ACTIVITY_LOG_PAGE_SIZE - 1);
    if (error) throw error;
    return {
      logs: (data ?? []).map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        createdAt: String(row.created_at),
        user: String(row.user_name ?? "System"),
        activity: String(row.activity ?? ""),
      })),
      total: count ?? 0,
      page: safePage,
      pageSize: ACTIVITY_LOG_PAGE_SIZE,
    };
  });
}
