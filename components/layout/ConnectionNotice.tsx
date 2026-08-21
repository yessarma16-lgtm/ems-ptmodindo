import { AlertTriangle, PlugZap } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function NotConfiguredNotice() {
  return (
    <Alert variant="warning" className="mb-6">
      <PlugZap className="mt-0.5" />
      <div>
        <AlertTitle>Google Spreadsheet connection is not configured</AlertTitle>
        <AlertDescription>
          The Employee Database (Google Spreadsheet) has not been connected yet. Fill in{" "}
          <code className="rounded bg-black/5 px-1 py-0.5">.env.local</code> with your Service
          Account credentials, then restart the app. See{" "}
          <Link href="/settings" className="underline underline-offset-2">
            Settings
          </Link>{" "}
          or <code className="rounded bg-black/5 px-1 py-0.5">docs/GOOGLE_SHEETS_SETUP.md</code>{" "}
          for step-by-step instructions.
        </AlertDescription>
      </div>
    </Alert>
  );
}

export function ConnectionErrorNotice({ message }: { message?: string }) {
  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="mt-0.5" />
      <div>
        <AlertTitle>Unable to connect to Employee Database</AlertTitle>
        <AlertDescription>
          {message ??
            "The app could not reach the Employee Database (Google Spreadsheet). Please check the spreadsheet sharing permissions and try again."}
        </AlertDescription>
      </div>
    </Alert>
  );
}
