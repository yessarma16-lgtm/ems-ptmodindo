import { AppShell } from "@/components/layout/AppShell";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { getEffectivePermissions } from "@/lib/module-permission";
import { allHiddenModulePermissions } from "@/config/module-permissions";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentSessionUser();
  const permissions = user ? await getEffectivePermissions(user) : allHiddenModulePermissions();
  return <AppShell currentUser={user} permissions={permissions}>{children}</AppShell>;
}
