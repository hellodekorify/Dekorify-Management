import { requireUser } from "@/lib/auth";
import { can, type AuthzUser } from "@/lib/rbac";
import { SettingsNav } from "./settings-nav";
import { PageBody, PageHeader } from "@/components/layout/page-header";

/** Which settings sub-pages this user may see, by permission. */
function allowedSettings(authz: AuthzUser): string[] {
  const allowed = ["/settings/profile"]; // everyone manages their own account
  if (can(authz, "Application Settings", "View")) allowed.push("/settings");
  if (can(authz, "User Management", "View")) allowed.push("/settings/users");
  if (can(authz, "Roles & Permissions", "View")) allowed.push("/settings/roles");
  if (can(authz, "Integrations", "View")) {
    allowed.push("/settings/shopify", "/settings/couriers", "/settings/tracking");
  }
  if (can(authz, "Audit Logs", "View")) allowed.push("/settings/activity");
  return allowed;
}

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your business details, your account, and the connections that feed data in."
      />
      <PageBody>
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          <SettingsNav allowed={allowedSettings(user.authz)} />
          <div className="min-w-0 flex-1 space-y-5">{children}</div>
        </div>
      </PageBody>
    </>
  );
}
