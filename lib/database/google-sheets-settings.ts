import "server-only";

import { SETTINGS_SHEET_NAME } from "@/config/master-data-sheets";
import { readSheet, appendRow, updateRow, deleteRow, ensureSheetWithHeaders } from "@/lib/google-sheets";
import { isBlankRow } from "@/lib/database/google-sheets-adapter";

const SETTINGS_HEADERS = ["KEY", "VALUE", "DESCRIPTION", "UPDATED_AT"];
const SETTINGS_LAST_COLUMN = "D";
const PUBLIC_APPLY_TOKEN_KEY = "public_apply_token";

/**
 * Google Sheets implementation of the generic key/value Settings storage —
 * mirrors lib/database/sqlite-settings.ts. The `Settings` sheet itself
 * already exists (STEP 2 placeholder in SUPPORTING_SHEET_HEADERS); this is
 * the first real read/write code for it.
 */

async function readSettingsRows(): Promise<string[][]> {
  await ensureSheetWithHeaders(SETTINGS_SHEET_NAME, SETTINGS_HEADERS);
  const rows = await readSheet(SETTINGS_SHEET_NAME, `A2:${SETTINGS_LAST_COLUMN}`);
  return rows.filter((r) => !isBlankRow(r));
}

/** Self-heals: creates the token row with a fresh value if it doesn't exist yet (e.g. first deploy). */
export async function getPublicApplyToken(): Promise<string> {
  const rows = await readSettingsRows();
  const row = rows.find((r) => r[0] === PUBLIC_APPLY_TOKEN_KEY);
  if (row) return row[1] ?? "";

  const token = crypto.randomUUID();
  await appendRow(SETTINGS_SHEET_NAME, [
    PUBLIC_APPLY_TOKEN_KEY,
    token,
    "Fixed token for the walk-in application QR code.",
    new Date().toISOString(),
  ]);
  return token;
}

export async function regeneratePublicApplyToken(): Promise<string> {
  const rows = await readSettingsRows();
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const rowIndex = rows.findIndex((r) => r[0] === PUBLIC_APPLY_TOKEN_KEY);

  if (rowIndex === -1) {
    await appendRow(SETTINGS_SHEET_NAME, [
      PUBLIC_APPLY_TOKEN_KEY,
      token,
      "Fixed token for the walk-in application QR code.",
      now,
    ]);
  } else {
    const description = rows[rowIndex][2] || "Fixed token for the walk-in application QR code.";
    await updateRow(SETTINGS_SHEET_NAME, rowIndex + 2, [PUBLIC_APPLY_TOKEN_KEY, token, description, now], SETTINGS_LAST_COLUMN);
  }
  return token;
}

/** Generic key/value read — returns "" if the key has never been set. Used for admin-uploaded background images. */
export async function getSettingValue(key: string): Promise<string> {
  const rows = await readSettingsRows();
  return rows.find((r) => r[0] === key)?.[1] ?? "";
}

/** Generic key/value upsert. Note: a single Sheets cell caps out around 50,000 characters — callers storing large values (e.g. images) must keep them well under that. */
export async function setSettingValue(key: string, value: string, description = ""): Promise<void> {
  const rows = await readSettingsRows();
  const now = new Date().toISOString();
  const rowIndex = rows.findIndex((r) => r[0] === key);
  if (rowIndex === -1) {
    await appendRow(SETTINGS_SHEET_NAME, [key, value, description, now]);
  } else {
    const existingDescription = description || rows[rowIndex][2] || "";
    await updateRow(SETTINGS_SHEET_NAME, rowIndex + 2, [key, value, existingDescription, now], SETTINGS_LAST_COLUMN);
  }
}

export async function deleteSettingValue(key: string): Promise<void> {
  const rows = await readSettingsRows();
  const rowIndex = rows.findIndex((r) => r[0] === key);
  if (rowIndex === -1) return;
  await deleteRow(SETTINGS_SHEET_NAME, rowIndex + 2);
}
