import { PageHeader } from "@/components/layout/PageHeader";
import { MyProfileForm } from "@/components/settings/MyProfileForm";
import { getCurrentSessionUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const user = await getCurrentSessionUser();

  return (
    <div>
      <PageHeader
        title="My Profile"
        description="Account information and sign-in password for your account."
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "My Profile" },
        ]}
      />
      {user ? (
        <MyProfileForm user={user} />
      ) : (
        <p className="text-sm text-muted-foreground">No account found.</p>
      )}
    </div>
  );
}
