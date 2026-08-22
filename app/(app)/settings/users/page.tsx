import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UserManagement } from "@/components/settings/UserManagement";
import { RoleAccessManager } from "@/components/settings/RoleAccessManager";
import { getCurrentSessionUser } from "@/lib/auth/current-user";
import { isDeveloperUser } from "@/lib/auth/developer-access";

export const dynamic = "force-dynamic";

export default async function UserManagementPage() {
  const isDeveloper = isDeveloperUser(await getCurrentSessionUser());
  return (
    <div>
      <PageHeader
        title="User Management"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "User Management" },
        ]}
      />
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="users">
            <TabsList>
              <TabsTrigger value="users">User Management</TabsTrigger>
              {isDeveloper && <TabsTrigger value="roles">Role Access</TabsTrigger>}
            </TabsList>
            <TabsContent value="users">
              <UserManagement />
            </TabsContent>
            {isDeveloper && <TabsContent value="roles"><RoleAccessManager /></TabsContent>}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
