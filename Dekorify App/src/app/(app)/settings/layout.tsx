import { SettingsNav } from "./settings-nav";
import { PageBody, PageHeader } from "@/components/layout/page-header";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your business details, your account, and the connections that feed data in."
      />
      <PageBody>
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          <SettingsNav />
          <div className="min-w-0 flex-1 space-y-5">{children}</div>
        </div>
      </PageBody>
    </>
  );
}
