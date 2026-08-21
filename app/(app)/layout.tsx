import { AppShell } from "@/components/layout/AppShell";
import { getCurrentSessionUser } from "@/lib/auth/current-user";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentSessionUser();
  return <AppShell currentUser={user}>{children}</AppShell>;
}
