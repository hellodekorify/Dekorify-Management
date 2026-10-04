"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Pencil,
  KeyRound,
  ShieldCheck,
  Ban,
  LogOut,
  AlertCircle,
  CheckCircle2,
  SlidersHorizontal,
} from "lucide-react";
import {
  createUserAction,
  updateUserAction,
  setUserAccessAction,
  setUserStatusAction,
  resetUserPasswordAction,
  revokeUserSessionsAction,
} from "@/app/actions/users";
import type { FormState } from "@/app/actions/auth";
import type { PermissionMap } from "@/lib/rbac";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { RowActions } from "@/components/ui/row-actions";
import { Pagination } from "@/components/ui/pagination";
import { PermissionMatrix, PermissionSummary } from "@/components/rbac/permission-matrix";

interface RoleOption {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: PermissionMap;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  accountType: string;
  status: string;
  department: string | null;
  roleId: string | null;
  roleName: string | null;
  createdByName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  permissionOverrides: string | null;
  isSelf: boolean;
}

const STATUS_TONE: Record<string, "positive" | "warning" | "negative" | "neutral"> = {
  ACTIVE: "positive",
  INVITED: "warning",
  SUSPENDED: "warning",
  DEACTIVATED: "negative",
};

function tempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `Dk-${s}9`;
}

export function UsersClient({
  rows,
  total,
  page,
  pageSize,
  search,
  status,
  roles,
  managers,
  actorType,
}: {
  rows: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  status: string;
  roles: RoleOption[];
  managers: { id: string; name: string }[];
  actorType: string;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [access, setAccess] = useState<UserRow | null>(null);
  const [simpleAction, setSimpleAction] = useState<{ row: UserRow; kind: SimpleKind } | null>(null);

  const hrefFor = (p: number) => {
    const sp = new URLSearchParams();
    if (search) sp.set("q", search);
    if (status && status !== "all") sp.set("status", status);
    sp.set("page", String(p));
    return `/settings/users?${sp.toString()}`;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="User management"
        description="Create and control every sub-account. New accounts get a temporary password and must change it on first sign-in."
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <UserPlus className="h-4 w-4" /> Create account
          </Button>
        }
      />

      <form className="flex flex-wrap items-end gap-3 border-b border-border-subtle px-4 py-3 sm:px-5" method="get">
        <Input
          name="q"
          label="Search"
          defaultValue={search}
          placeholder="Name, email or employee ID"
          wrapperClassName="w-full sm:w-64"
        />
        <Field label="Status" className="w-full sm:w-44">
          <select
            name="status"
            defaultValue={status}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-[13.5px]"
          >
            <option value="all">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INVITED">Invited</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>
        </Field>
        <Button type="submit" variant="secondary" size="sm">
          Apply
        </Button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-muted text-left text-[12px] text-muted-strong">
              <th className="px-4 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-3 py-2.5 font-semibold">Department</th>
              <th className="px-3 py-2.5 font-semibold">Role</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Last login</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  No accounts match.
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-foreground">{u.name}</div>
                    <div className="text-[12px] text-muted">{u.email}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={u.accountType === "SUPER_ADMIN" ? "brand" : "neutral"}>
                      {u.accountType === "SUPER_ADMIN"
                        ? "Super Admin"
                        : u.accountType === "ADMIN"
                          ? "Admin"
                          : "Department"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted">{u.department ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted">{u.roleName ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={STATUS_TONE[u.status] ?? "neutral"} dot>
                      {u.status.charAt(0) + u.status.slice(1).toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-3 py-2.5">
                    {u.accountType === "SUPER_ADMIN" || u.isSelf ? (
                      <span className="block text-right text-[12px] text-muted">—</span>
                    ) : (
                      <RowActions
                        actions={[
                          { label: "Edit details", icon: Pencil, onSelect: () => setEditing(u) },
                          { label: "Role & permissions", icon: SlidersHorizontal, onSelect: () => setAccess(u) },
                          { label: "Reset password", icon: KeyRound, onSelect: () => setSimpleAction({ row: u, kind: "reset" }) },
                          { label: "Revoke sessions", icon: LogOut, onSelect: () => setSimpleAction({ row: u, kind: "revoke" }) },
                          ...(u.status === "ACTIVE"
                            ? [{ label: "Suspend", icon: Ban, tone: "danger" as const, onSelect: () => setSimpleAction({ row: u, kind: "suspend" }) }]
                            : [{ label: "Reactivate", icon: ShieldCheck, onSelect: () => setSimpleAction({ row: u, kind: "reactivate" }) }]),
                          ...(u.status !== "DEACTIVATED"
                            ? [{ label: "Deactivate", icon: Ban, tone: "danger" as const, onSelect: () => setSimpleAction({ row: u, kind: "deactivate" }) }]
                            : []),
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={hrefFor} />

      {creating && (
        <CreateWizard
          roles={roles}
          managers={managers}
          actorType={actorType}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && <EditDrawer row={editing} managers={managers} onClose={() => setEditing(null)} />}
      {access && <AccessEditor row={access} roles={roles} onClose={() => setAccess(null)} />}
      {simpleAction && (
        <SimpleActionModal
          row={simpleAction.row}
          kind={simpleAction.kind}
          onClose={() => setSimpleAction(null)}
        />
      )}
    </Card>
  );
}

// --- Create wizard ---------------------------------------------------------

function CreateWizard({
  roles,
  managers,
  actorType,
  onClose,
}: {
  roles: RoleOption[];
  managers: { id: string; name: string }[];
  actorType: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState(1);
  const [state, formAction, pending] = useActionState<FormState, FormData>(createUserAction, null);
  const router = useRouter();

  // Form field state we need to carry across steps / into the matrix.
  const [accountType, setAccountType] = useState("DEPARTMENT");
  const [roleId, setRoleId] = useState("");
  const [perms, setPerms] = useState<PermissionMap>({});
  const [pw, setPw] = useState(tempPassword());
  const [fields, setFields] = useState({
    name: "",
    email: "",
    department: "",
    jobTitle: "",
    phone: "",
    employeeId: "",
    reportingManagerId: "",
    expiresAt: "",
    notes: "",
  });

  // When the role changes, seed the matrix from it.
  useEffect(() => {
    const role = roles.find((r) => r.id === roleId);
    setPerms(role ? structuredClone(role.permissions) : {});
  }, [roleId, roles]);

  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  const set = (k: keyof typeof fields, v: string) => setFields((f) => ({ ...f, [k]: v }));

  return (
    <Modal open onClose={onClose} title="Create account" size="xl">
      <form action={formAction} className="space-y-5">
        {/* Hidden carriers so the server gets everything regardless of step. */}
        <input type="hidden" name="accountType" value={accountType} />
        <input type="hidden" name="roleId" value={roleId} />
        <input type="hidden" name="permissions" value={JSON.stringify(perms)} />
        <input type="hidden" name="tempPassword" value={pw} />
        {(Object.keys(fields) as (keyof typeof fields)[]).map((k) => (
          <input key={k} type="hidden" name={k} value={fields[k]} />
        ))}

        <StepHeader step={step} />

        {state?.message && !state.ok && (
          <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-negative-border bg-negative-soft p-3">
            <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-negative" aria-hidden />
            <p className="text-[13px] leading-snug text-negative">{state.message}</p>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Full name" value={fields.name} onChange={(e) => set("name", e.target.value)} required error={state?.errors?.name} />
            <Input label="Email" type="email" value={fields.email} onChange={(e) => set("email", e.target.value)} required error={state?.errors?.email} />
            <Field label="Account type">
              <select value={accountType} onChange={(e) => setAccountType(e.target.value)} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-[13.5px]">
                <option value="DEPARTMENT">Department user</option>
                {actorType === "SUPER_ADMIN" && <option value="ADMIN">Admin</option>}
              </select>
            </Field>
            <Input label="Department" value={fields.department} onChange={(e) => set("department", e.target.value)} />
            <Input label="Job title" value={fields.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
            <Input label="Phone" value={fields.phone} onChange={(e) => set("phone", e.target.value)} />
            <Input label="Employee ID" value={fields.employeeId} onChange={(e) => set("employeeId", e.target.value)} />
            <Field label="Reporting manager">
              <select value={fields.reportingManagerId} onChange={(e) => set("reportingManagerId", e.target.value)} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-[13.5px]">
                <option value="">None</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </Field>
            <Input label="Account expiry (optional)" type="date" value={fields.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
            <div className="sm:col-span-2">
              <Input label="Internal notes" value={fields.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>
        )}

        {step === 2 && (
          <Field label="Role" hint="A starting point for permissions. You can adjust them in the next step.">
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-[13.5px]">
              <option value="">No role (set permissions manually)</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.isSystem ? " (system)" : ""}</option>
              ))}
            </select>
          </Field>
        )}

        {step === 3 && (
          <Field label="Permissions" hint="Grant or revoke per module. You can only grant what you yourself hold.">
            <PermissionMatrix value={perms} onChange={setPerms} />
          </Field>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
              <Summary label="Name" value={fields.name} />
              <Summary label="Email" value={fields.email} />
              <Summary label="Account type" value={accountType === "ADMIN" ? "Admin" : "Department user"} />
              <Summary label="Role" value={roles.find((r) => r.id === roleId)?.name ?? "None"} />
              <Summary label="Department" value={fields.department || "—"} />
              <Summary label="Job title" value={fields.jobTitle || "—"} />
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-foreground">Permissions</p>
              <PermissionSummary value={perms} />
            </div>
            <Field label="Temporary password" hint="Share this with the user. They must change it on first sign-in.">
              <div className="flex gap-2">
                <Input name="__tempDisplay" value={pw} readOnly wrapperClassName="flex-1" />
                <Button type="button" variant="secondary" onClick={() => setPw(tempPassword())}>
                  Regenerate
                </Button>
              </div>
            </Field>
            {state?.errors?.tempPassword && (
              <p className="text-[12.5px] text-negative">{state.errors.tempPassword}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <Button type="button" variant="ghost" onClick={() => (step === 1 ? onClose() : setStep(step - 1))}>
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < 4 ? (
            <Button type="button" onClick={() => setStep(step + 1)} disabled={step === 1 && (!fields.name || !fields.email)}>
              Continue
            </Button>
          ) : (
            <Button type="submit" loading={pending}>
              Create account
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function StepHeader({ step }: { step: number }) {
  const labels = ["Details", "Role", "Permissions", "Review"];
  return (
    <ol className="flex items-center gap-2 text-[12px]">
      {labels.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                active ? "bg-brand text-white" : done ? "bg-brand-soft text-brand" : "bg-surface-muted text-muted"
              }`}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
            </span>
            <span className={active ? "font-medium text-foreground" : "text-muted"}>{label}</span>
            {n < 4 && <span className="mx-1 text-muted/40">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

// --- Edit details ----------------------------------------------------------

function EditDrawer({
  row,
  managers,
  onClose,
}: {
  row: UserRow;
  managers: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateUserAction, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  return (
    <Modal open onClose={onClose} title={`Edit ${row.name}`} size="lg">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={row.id} />
        {state?.message && !state.ok && (
          <p className="rounded-lg border border-negative-border bg-negative-soft p-3 text-[13px] text-negative">{state.message}</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="name" label="Full name" defaultValue={row.name} required error={state?.errors?.name} />
          <Input name="department" label="Department" defaultValue={row.department ?? ""} />
          <Input name="jobTitle" label="Job title" defaultValue={""} />
          <Input name="phone" label="Phone" defaultValue={""} />
          <Input name="employeeId" label="Employee ID" defaultValue={""} />
          <Field label="Reporting manager">
            <select name="reportingManagerId" className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-[13.5px]">
              <option value="">None</option>
              {managers.filter((m) => m.id !== row.id).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </Field>
          <Input name="expiresAt" label="Account expiry" type="date" />
          <div className="sm:col-span-2">
            <Input name="notes" label="Internal notes" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>Save changes</Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Role & permissions ----------------------------------------------------

function AccessEditor({
  row,
  roles,
  onClose,
}: {
  row: UserRow;
  roles: RoleOption[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(setUserAccessAction, null);
  const router = useRouter();

  const initial = useMemo<PermissionMap>(() => {
    // Reconstruct the user's effective-ish starting matrix from role + overrides.
    const role = roles.find((r) => r.id === row.roleId);
    const base: PermissionMap = role ? structuredClone(role.permissions) : {};
    try {
      const ov = row.permissionOverrides ? JSON.parse(row.permissionOverrides) : {};
      for (const [m, acts] of Object.entries(ov.add ?? {})) base[m as keyof PermissionMap] = Array.from(new Set([...(base[m as keyof PermissionMap] ?? []), ...(acts as string[])])) as never;
      for (const [m, acts] of Object.entries(ov.remove ?? {})) {
        const cur = base[m as keyof PermissionMap];
        if (cur) base[m as keyof PermissionMap] = cur.filter((a) => !(acts as string[]).includes(a)) as never;
      }
    } catch {
      /* ignore malformed overrides */
    }
    return base;
  }, [row, roles]);

  const [roleId, setRoleId] = useState(row.roleId ?? "");
  const [perms, setPerms] = useState<PermissionMap>(initial);

  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  return (
    <Modal open onClose={onClose} title={`Role & permissions: ${row.name}`} size="xl">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={row.id} />
        <input type="hidden" name="roleId" value={roleId} />
        <input type="hidden" name="permissions" value={JSON.stringify(perms)} />
        {state?.message && !state.ok && (
          <p className="rounded-lg border border-negative-border bg-negative-soft p-3 text-[13px] text-negative">{state.message}</p>
        )}
        <Field label="Role" hint="Changing the role resets the matrix to that role's permissions.">
          <select
            value={roleId}
            onChange={(e) => {
              const id = e.target.value;
              setRoleId(id);
              const role = roles.find((r) => r.id === id);
              setPerms(role ? structuredClone(role.permissions) : {});
            }}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-[13.5px]"
          >
            <option value="">No role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}{r.isSystem ? " (system)" : ""}</option>
            ))}
          </select>
        </Field>
        <Field label="Permissions">
          <PermissionMatrix value={perms} onChange={setPerms} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>Save access</Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Simple confirm-style actions -----------------------------------------

type SimpleKind = "reset" | "revoke" | "suspend" | "reactivate" | "deactivate";

function SimpleActionModal({ row, kind, onClose }: { row: UserRow; kind: SimpleKind; onClose: () => void }) {
  const config: Record<SimpleKind, { title: string; body: string; confirm: string; danger?: boolean; action: typeof resetUserPasswordAction; extra?: Record<string, string> }> = {
    reset: { title: "Reset password", body: `Generate a new temporary password for ${row.email}. Their sessions will end and they must set a new password on next sign-in.`, confirm: "Reset password", action: resetUserPasswordAction },
    revoke: { title: "Revoke sessions", body: `Sign ${row.email} out of all devices.`, confirm: "Revoke sessions", action: revokeUserSessionsAction },
    suspend: { title: "Suspend account", body: `${row.email} will be signed out and unable to sign in until reactivated.`, confirm: "Suspend", danger: true, action: setUserStatusAction, extra: { status: "SUSPENDED" } },
    reactivate: { title: "Reactivate account", body: `Allow ${row.email} to sign in again.`, confirm: "Reactivate", action: setUserStatusAction, extra: { status: "ACTIVE" } },
    deactivate: { title: "Deactivate account", body: `${row.email} will be permanently deactivated (not deleted). They cannot sign in.`, confirm: "Deactivate", danger: true, action: setUserStatusAction, extra: { status: "DEACTIVATED" } },
  };
  const c = config[kind];
  const [state, formAction, pending] = useActionState<FormState, FormData>(c.action, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && kind !== "reset") {
      onClose();
      router.refresh();
    }
  }, [state, kind, onClose, router]);

  return (
    <Modal open onClose={onClose} title={c.title} size="sm">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={row.id} />
        {c.extra && Object.entries(c.extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}

        {state?.ok ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-positive-border bg-positive-soft p-3">
            <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-positive" aria-hidden />
            <p className="text-[13px] leading-snug text-positive break-all">{state.message}</p>
          </div>
        ) : (
          <>
            {state?.message && (
              <p className="rounded-lg border border-negative-border bg-negative-soft p-3 text-[13px] text-negative">{state.message}</p>
            )}
            <p className="text-[13.5px] text-muted">{c.body}</p>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => { onClose(); if (state?.ok) router.refresh(); }}>
            {state?.ok ? "Done" : "Cancel"}
          </Button>
          {!state?.ok && (
            <Button type="submit" variant={c.danger ? "danger" : "primary"} loading={pending}>
              {c.confirm}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
