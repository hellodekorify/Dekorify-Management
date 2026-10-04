"use client";

import { MODULES, type Action, type Module, type PermissionMap } from "@/lib/rbac";

const ALL_MODULES = Object.keys(MODULES) as Module[];

/**
 * The modules × actions grid used by both the role editor and the user create
 * wizard. Controlled: the parent owns the PermissionMap and gets a new one on
 * every change. Only actions valid for a module are shown.
 */
export function PermissionMatrix({
  value,
  onChange,
  disabled = false,
}: {
  value: PermissionMap;
  onChange: (next: PermissionMap) => void;
  disabled?: boolean;
}) {
  const has = (module: Module, action: Action) => (value[module] ?? []).includes(action);

  const toggle = (module: Module, action: Action) => {
    const current = new Set(value[module] ?? []);
    if (current.has(action)) current.delete(action);
    else current.add(action);
    const next: PermissionMap = { ...value };
    if (current.size) next[module] = Array.from(current) as Action[];
    else delete next[module];
    onChange(next);
  };

  const toggleModuleAll = (module: Module, on: boolean) => {
    const next: PermissionMap = { ...value };
    if (on) next[module] = [...MODULES[module]] as Action[];
    else delete next[module];
    onChange(next);
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border-subtle bg-surface-muted text-left">
            <th className="px-3 py-2.5 font-semibold text-muted-strong">Module</th>
            {(["View", "Create", "Edit", "Delete", "Approve", "Export", "Manage"] as Action[]).map(
              (action) => (
                <th key={action} className="px-2 py-2.5 text-center font-medium text-muted">
                  {action}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {ALL_MODULES.map((module) => {
            const allowed = MODULES[module] as readonly Action[];
            const every = allowed.every((a) => has(module, a));
            return (
              <tr key={module} className="border-b border-border-subtle last:border-0">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleModuleAll(module, !every)}
                    className="font-medium text-foreground hover:text-brand disabled:cursor-not-allowed"
                    title={every ? "Clear this module" : "Select all for this module"}
                  >
                    {module}
                  </button>
                </td>
                {(["View", "Create", "Edit", "Delete", "Approve", "Export", "Manage"] as Action[]).map(
                  (action) => {
                    const applicable = allowed.includes(action);
                    return (
                      <td key={action} className="px-2 py-2 text-center">
                        {applicable ? (
                          <input
                            type="checkbox"
                            checked={has(module, action)}
                            disabled={disabled}
                            onChange={() => toggle(module, action)}
                            aria-label={`${action} ${module}`}
                            className="h-4 w-4 cursor-pointer rounded border-border-strong text-brand focus:ring-brand disabled:cursor-not-allowed"
                          />
                        ) : (
                          <span className="text-muted/40" aria-hidden>
                            –
                          </span>
                        )}
                      </td>
                    );
                  },
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A compact read-only summary of a permission map, for the review step. */
export function PermissionSummary({ value }: { value: PermissionMap }) {
  const entries = (Object.keys(MODULES) as Module[])
    .map((m) => [m, value[m] ?? []] as const)
    .filter(([, actions]) => actions.length > 0);

  if (entries.length === 0) {
    return <p className="text-[13px] text-muted">No permissions granted.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {entries.map(([module, actions]) => (
        <li key={module} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
          <span className="font-medium text-foreground">{module}:</span>
          <span className="text-muted">{actions.join(", ")}</span>
        </li>
      ))}
    </ul>
  );
}
