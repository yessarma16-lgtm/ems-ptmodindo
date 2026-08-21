import { LoginForm } from "@/components/auth/LoginForm";
import { getBackgroundImage } from "@/lib/settings-service";
import { isDatabaseConfigured } from "@/lib/database/database";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const backgroundDataUri = isDatabaseConfigured() ? await getBackgroundImage("login").catch(() => "") : "";
  return <LoginForm backgroundDataUri={backgroundDataUri} />;
}
