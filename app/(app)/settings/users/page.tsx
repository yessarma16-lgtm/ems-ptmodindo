import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UserManagement } from "@/components/settings/UserManagement";
import { RoleAccessManager } from "@/components/settings/RoleAccessManager";

export const dynamic = "force-dynamic";

export default function UserManagementPage() {
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
              <TabsTrigger value="roles">Role Access</TabsTrigger>
            </TabsList>
            <TabsContent value="users">
              <UserManagement />
            </TabsContent>
            <TabsContent value="roles">
              <RoleAccessManager />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
