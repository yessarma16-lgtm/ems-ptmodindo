# Google Sheets Setup Guide

This guide walks you through connecting **Employee Management System** to your
Google Spreadsheet, which is the main database for this app (Employee
Master data). No SQL database is used — Google Sheets **is** the database.

You only need to do this once. Steps 1–8 happen in your browser (Google
Cloud Console / Google Sheets). Steps 9–11 happen back in VS Code / this
project.

---

## 1. Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/).
2. Click the project dropdown (top bar) → **New Project**.
3. Name it e.g. `employee-management-system` → **Create**.
4. Wait for the project to be created, then select it.

## 2. Enable the Google Sheets API

1. In the Cloud Console, go to **APIs & Services → Library**.
2. Search for **Google Sheets API**.
3. Click it, then click **Enable**.

## 3. Create a Service Account

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → Service account**.
3. Give it a name, e.g. `employee-sheets-service`.
4. Click **Create and Continue**, then **Done** (no extra roles needed —
   access is granted later by sharing the spreadsheet directly).

## 4. Create a Service Account Key

1. Open the Service Account you just created.
2. Go to the **Keys** tab → **Add Key → Create new key**.
3. Choose **JSON** → **Create**.
4. A `.json` file will download to your computer. **Keep this file private**
   — it contains credentials that must never be committed to Git or shared
   publicly.

## 5. Get the Service Account Email

Open the downloaded JSON file. Copy the value of `"client_email"`, e.g.:

```
employee-sheets-service@employee-management-system.iam.gserviceaccount.com
```

You will paste this into `.env.local` in Step 9.

## 6. Create the Google Spreadsheet

1. Go to [sheets.google.com](https://sheets.google.com/) and create a new
   blank spreadsheet.
2. Name it, e.g. **Employee Database**.
3. Copy the **Spreadsheet ID** from its URL:

   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_IS_HERE/edit
   ```

## 7. Share the Spreadsheet with the Service Account

1. In the spreadsheet, click **Share** (top right).
2. Paste the Service Account email from Step 5.
3. Set its permission to **Editor**.
4. Uncheck "Notify people" (it's a service account, not a person) → **Share**.

## 8. Permission Recap

The Service Account must have **Editor** access on the spreadsheet — this
lets the app read and write the `Employees` sheet (and future sheets:
`Contract_History`, `Family`, `BPJS`, `Bank`, `Departments`, `Positions`,
`Levels`, `Skills`, `Lookup`, `Settings`, `Audit_Log`).

The app will automatically create the `Employees` sheet with the correct
header row the first time you add an employee, if it doesn't already exist.
It never deletes or overwrites existing sheets/data.

## 9. Fill in `.env.local`

Open `.env.local` in the project root (already created for you) and fill in
the three values:

```env
GOOGLE_SHEETS_SPREADSHEET_ID=paste_your_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_EMAIL=paste_the_client_email_here
GOOGLE_PRIVATE_KEY="paste_the_private_key_here_with_\n_kept_literal"
```

For `GOOGLE_PRIVATE_KEY`, open the downloaded JSON file and copy the
`"private_key"` value **exactly as-is**, including the quotes around it and
the `\n` sequences — do not convert them to real line breaks. Example
shape (yours will be much longer):

```env
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

`.env.local` is already listed in `.gitignore`, so it will never be
committed to Git.

## 10. Run the Application

In VS Code's terminal, from the project folder:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 11. Test the Connection

1. Go to the **Settings** page in the app sidebar.
2. Click **Test Connection**.
3. On success, you'll see the spreadsheet title and its sheet list.
4. Go to **Employees → Add Employee**, fill in the required fields
   (NIK, Name, Department, Position, Join Date), and click **Save Employee**.
5. Open your Google Spreadsheet — a new `Employees` sheet with a header row
   and your new employee's data should now appear.

---

## Troubleshooting

- **"Google Spreadsheet connection is not configured"** → one or more of
  the three `.env.local` values is empty. Fill them in and restart
  `npm run dev`.
- **"Unable to connect to Employee Database"** → credentials are set but
  the request failed. Double check:
  - The spreadsheet is shared with the exact Service Account email, with
    **Editor** access.
  - The Spreadsheet ID is correct (no extra characters from the URL).
  - The Google Sheets API is enabled on the Cloud project tied to this
    Service Account.
- **Private key errors** → make sure the value is wrapped in double quotes
  in `.env.local` and the `\n` sequences were not accidentally converted to
  real newlines by your editor.
