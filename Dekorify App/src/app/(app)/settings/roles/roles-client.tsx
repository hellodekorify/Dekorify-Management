"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Shield, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  createRoleAction,
  updateRoleAction,
  deleteRoleAction,
} from "@/app/actions/roles";
import type { FormState } from "@/app/actions/auth";
import type { PermissionMap } from "@/lib/rbac";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { RowActions } from "@/components/ui/row-actions";
import { PermissionMatrix } from "@/components/rbac/permission-matrix";

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: PermissionMap;
}

export function RolesClient({ roles }: { roles: RoleRow[] }) {
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RoleRow | null>(null);

  return (
    <Card>
      <CardHeader
        title="Roles & permissions"
        description="Named permission sets a Super Admin can assign. System roles can be edited but not deleted."
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New role
          </Button>
        }
      />
      <CardBody className="p-0">
        <ul className="divide-y divide-border-subtle">
          {roles.map((role) => (
            <li key={role.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Shield className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{role.name}</span>
                  {role.isSystem && <Badge tone="neutral">System</Badge>}
                  <Badge tone="info">
                    {role.userCount} user{role.userCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                {role.description && (
                  <p className="mt-0.5 text-[13px] text-muted">{role.description}</p>
                )}
              </div>
              <RowActions
                actions={[
                  { label: "Edit", icon: Pencil, onSelect: () => setEditing(role) },
                  ...(role.isSystem
                    ? []
                    : [
                        {
                          label: "Delete",
                          icon: Trash2,
                          tone: "danger" as const,
                          onSelect: () => setDeleting(role),
                        },
                      ]),
                ]}
              />
            </li>
          ))}
        </ul>
      </CardBody>

      {creating && <RoleEditor onClose={() => setCreating(false)} />}
      {editing && <RoleEditor role={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <DeleteRole role={deleting} onClose={() => setDeleting(null)} />
      )}
    </Card>
  );
}

function RoleEditor({ role, onClose }: { role?: RoleRow; onClose: () => void }) {
  const action = role ? updateRoleAction : createRoleAction;
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, null);
  const [perms, setPerms] = useState<PermissionMap>(role?.permissions ?? {});

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title={role ? `Edit role: ${role.name}` : "New role"}
      size="xl"
    >
      <form action={formAction} className="space-y-4">
        {role && <input type="hidden" name="id" value={role.id} />}
        <input type="hidden" name="permissions" value={JSON.stringify(perms)} />

        {state?.message && !state.ok && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-negative-border bg-negative-soft p-3"
          >
            <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-negative" aria-hidden />
            <p className="text-[13px] leading-snug text-negative">{state.message}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="name"
            label="Role name"
            defaultValue={role?.name}
            required
            error={state?.errors?.name}
          />
          <Input
            name="description"
            label="Description"
            defaultValue={role?.description ?? ""}
            error={state?.errors?.description}
          />
        </div>

        <Field label="Permissions">
          <PermissionMatrix value={perms} onChange={setPerms} />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {role ? "Save changes" : "Create role"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteRole({ role, onClose }: { role: RoleRow; onClose: () => void }) {
  const [state, formAction] = useActionState<FormState, FormData>(deleteRoleAction, null);

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal open onClose={onClose} title={`Delete role: ${role.name}`} size="sm">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={role.id} />
        {state?.message && !state.ok && (
          <p className="rounded-lg border border-negative-border bg-negative-soft p-3 text-[13px] text-negative">
            {state.message}
          </p>
        )}
        <p className="text-[13.5px] text-muted">
          This permanently removes the role. Users must be reassigned first.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger">
            Delete role
          </Button>
        </div>
      </form>
    </Modal>
  );
}
