import "server-only";

import { getSupabaseClient, supabaseGuarded } from "@/lib/supabase";
import { PUBLIC_APPLY_TOKEN_KEY } from "@/lib/database/postgres-init";

export { PUBLIC_APPLY_TOKEN_KEY };

/**
 * Generic key/value settings storage — Postgres (Supabase) mirror of
 * lib/database/sqlite-settings.ts.
 */

/** Returns the fixed walk-in application token. Always present — seeded by ensurePublicApplyToken during `npm run db:init:postgres`. */
export async function getPublicApplyToken(): Promise<string> {
  return getSettingValue(PUBLIC_APPLY_TOKEN_KEY);
}

/** Rotates the walk-in application token — any previously printed/shared QR code or link stops working immediately. */
export async function regeneratePublicApplyToken(): Promise<string> {
  const token = crypto.randomUUID();
  await setSettingValue(PUBLIC_APPLY_TOKEN_KEY, token);
  return token;
}

/** Generic key/value read — returns "" if the key has never been set. Used for admin-uploaded background images. */
export async function getSettingValue(key: string): Promise<string> {
  return supabaseGuarded(async () => {
    const { data, error } = await getSupabaseClient().from("settings").select("value").eq("key", key).maybeSingle();
    if (error) throw error;
    return (data as { value: string } | null)?.value ?? "";
  });
}

/** Generic key/value upsert. On conflict, only `value`/`updated_at` change — an existing row's `description` is preserved, matching sqlite-settings.ts's `ON CONFLICT ... DO UPDATE SET value, updated_at` (description excluded). */
export async function setSettingValue(key: string, value: string, description = ""): Promise<void> {
  return supabaseGuarded(async () => {
    const client = getSupabaseClient();
    const { data: existing, error: findError } = await client.from("settings").select("key").eq("key", key).maybeSingle();
    if (findError) throw findError;

    const now = new Date().toISOString();
    if (existing) {
      const { error } = await client.from("settings").update({ value, updated_at: now }).eq("key", key);
      if (error) throw error;
    } else {
      const { error } = await client.from("settings").insert({ key, value, description, updated_at: now });
      if (error) throw error;
    }
  });
}

export async function deleteSettingValue(key: string): Promise<void> {
  return supabaseGuarded(async () => {
    const { error } = await getSupabaseClient().from("settings").delete().eq("key", key);
    if (error) throw error;
  });
}
