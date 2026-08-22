import "server-only";

import * as postgresStore from "@/lib/database/postgres-settings";

/** App-wide key/value settings — available on all three providers (data/employee.db, the `Settings` sheet, or the Postgres `settings` table). */

const store = () => postgresStore;

export async function getPublicApplyToken(): Promise<string> {
  return store().getPublicApplyToken();
}

export async function regeneratePublicApplyToken(): Promise<string> {
  return store().regeneratePublicApplyToken();
}

/** Which page(s) an admin-uploaded background wallpaper applies to. */
export type BackgroundSurface = "login" | "qr" | "apply";

function backgroundKey(surface: BackgroundSurface): string {
  return `background_${surface}`;
}

/** Returns the stored data: URI for this surface, or "" if none was uploaded (caller falls back to its built-in default). */
export async function getBackgroundImage(surface: BackgroundSurface): Promise<string> {
  return store().getSettingValue(backgroundKey(surface));
}

export async function setBackgroundImage(surface: BackgroundSurface, dataUri: string): Promise<void> {
  await store().setSettingValue(backgroundKey(surface), dataUri, `Custom background wallpaper for ${surface}.`);
}

/** Removes the custom background — the surface reverts to its built-in default. */
export async function resetBackgroundImage(surface: BackgroundSurface): Promise<void> {
  await store().deleteSettingValue(backgroundKey(surface));
}
