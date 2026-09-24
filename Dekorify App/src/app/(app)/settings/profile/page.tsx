import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ProfileForm, PasswordForm } from "../settings-forms";

export const metadata: Metadata = { title: "Your account" };

export default async function ProfileSettingsPage() {
  const { user } = await requireContext();

  const [record, sessionCount, stores] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { name: true, email: true, createdAt: true, lastLoginAt: true },
    }),
    prisma.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
    prisma.storeMember.findMany({
      where: { userId: user.id },
      include: { store: { select: { name: true, baseCurrency: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <>
      <Card>
        <CardHeader title="Your details" description="Used to sign in and to attribute changes." />
        <ProfileForm user={{ name: record.name, email: record.email }} />
      </Card>

      <Card>
        <CardHeader title="Password" description="Choose something you do not use elsewhere." />
        <PasswordForm />
      </Card>

      <Card>
        <CardHeader
          title="Account"
          description={`Member since ${formatDate(record.createdAt)}`}
        />
        <CardBody className="space-y-3 text-[13.5px]">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted">Last signed in</span>
            <span className="font-medium">
              {record.lastLoginAt ? formatDate(record.lastLoginAt) : "—"}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted">Active sessions</span>
            <span className="font-medium">{sessionCount}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted">Stores</span>
            <span className="text-right font-medium">
              {stores.map((membership) => (
                <span key={membership.id} className="block">
                  {membership.store.name}{" "}
                  <span className="text-[12px] font-normal text-muted">
                    ({membership.store.baseCurrency} · {membership.role.toLowerCase()})
                  </span>
                </span>
              ))}
            </span>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
