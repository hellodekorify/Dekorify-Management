// =============================================================================
// Role-based access control
// =============================================================================
//
// Permissions are (module, action) pairs. A user's effective permissions are
// their role's permissions, plus per-user overrides, with Super Admin granted
// everything. Every server action and API route checks `requirePermission`
// before it reads or writes — the UI only *hides* what a user cannot do; this
// module is what actually *enforces* it. Client-supplied roles or permissions
// are never trusted: effective permissions are always recomputed server-side
// from the database.
// =============================================================================

export const ACCOUNT_TYPES = ["SUPER_ADMIN", "ADMIN", "DEPARTMENT"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_STATUSES = ["INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACTIONS = [
  "View",
  "Create",
  "Edit",
  "Delete",
  "Approve",
  "Export",
  "Manage",
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Every module and the actions that are meaningful on it. The permission matrix
 * in the admin UI is generated from this, and `requirePermission` validates
 * against it, so a module/action pair that is not listed here cannot be granted
 * or required by a typo.
 */
export const MODULES = {
  Dashboard: ["View"],
  Orders: ["View", "Create", "Edit", "Delete", "Approve", "Export", "Manage"],
  Products: ["View", "Create", "Edit", "Delete", "Export", "Manage"],
  Inventory: ["View", "Edit", "Export", "Manage"],
  Customers: ["View", "Edit", "Export"],
  Finance: ["View", "Create", "Edit", "Delete", "Approve", "Export", "Manage"],
  Reports: ["View", "Export"],
  "Customer Support": ["View", "Create", "Edit", "Manage"],
  "User Management": ["View", "Create", "Edit", "Delete", "Manage"],
  "Roles & Permissions": ["View", "Create", "Edit", "Delete", "Manage"],
  Integrations: ["View", "Manage"],
  "Application Settings": ["View", "Manage"],
  "Audit Logs": ["View", "Export"],
} as const satisfies Record<string, readonly Action[]>;

export type Module = keyof typeof MODULES;
export const MODULE_NAMES = Object.keys(MODULES) as Module[];

/** A permission set: module name -> granted actions. */
export type PermissionMap = Partial<Record<Module, Action[]>>;

export interface PermissionOverrides {
  add?: PermissionMap;
  remove?: PermissionMap;
}

/** The identity + authorization data `can`/`requirePermission` need. */
export interface AuthzUser {
  id: string;
  accountType: AccountType;
  status: AccountStatus;
  rolePermissions: PermissionMap; // already parsed from the role
  overrides: PermissionOverrides;
}

// --- Parsing --------------------------------------------------------------

function isModule(name: string): name is Module {
  return Object.prototype.hasOwnProperty.call(MODULES, name);
}

function isValidAction(module: Module, action: string): action is Action {
  return (MODULES[module] as readonly string[]).includes(action);
}

/** Parses a stored JSON permission map, discarding anything not in MODULES. */
export function parsePermissionMap(json: string | null | undefined): PermissionMap {
  if (!json) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object") return {};

  const out: PermissionMap = {};
  for (const [module, actions] of Object.entries(raw as Record<string, unknown>)) {
    if (!isModule(module) || !Array.isArray(actions)) continue;
    const valid = actions.filter(
      (a): a is Action => typeof a === "string" && isValidAction(module, a),
    );
    if (valid.length) out[module] = Array.from(new Set(valid));
  }
  return out;
}

export function parseOverrides(json: string | null | undefined): PermissionOverrides {
  if (!json) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  return {
    add: parsePermissionMap(obj.add ? JSON.stringify(obj.add) : null),
    remove: parsePermissionMap(obj.remove ? JSON.stringify(obj.remove) : null),
  };
}

export function serialisePermissionMap(map: PermissionMap): string {
  return JSON.stringify(map);
}

// --- Effective permissions ------------------------------------------------

/**
 * Role permissions, plus overrides.add, minus overrides.remove. Super Admin is
 * handled separately in `can` (they always pass), so this is only meaningful
 * for ADMIN / DEPARTMENT accounts.
 */
export function effectivePermissions(user: AuthzUser): PermissionMap {
  const out: PermissionMap = {};
  const put = (module: Module, actions: Action[]) => {
    out[module] = Array.from(new Set([...(out[module] ?? []), ...actions]));
  };

  for (const [module, actions] of Object.entries(user.rolePermissions)) {
    if (actions) put(module as Module, actions);
  }
  for (const [module, actions] of Object.entries(user.overrides.add ?? {})) {
    if (actions) put(module as Module, actions);
  }
  for (const [module, actions] of Object.entries(user.overrides.remove ?? {})) {
    if (!actions) continue;
    const current = out[module as Module];
    if (current) {
      out[module as Module] = current.filter((a) => !actions.includes(a));
    }
  }
  return out;
}

/** True if the user may perform `action` on `module`. */
export function can(user: AuthzUser, module: Module, action: Action): boolean {
  if (user.status !== "ACTIVE") return false;
  if (user.accountType === "SUPER_ADMIN") return true;
  const granted = effectivePermissions(user)[module] ?? [];
  // "Manage" implies every other action on a module.
  return granted.includes(action) || granted.includes("Manage");
}

/** Convenience: can the user open the module at all (any action)? */
export function canAccessModule(user: AuthzUser, module: Module): boolean {
  if (user.status !== "ACTIVE") return false;
  if (user.accountType === "SUPER_ADMIN") return true;
  return (effectivePermissions(user)[module] ?? []).length > 0;
}

/**
 * Super Admins outrank everyone; an Admin may only act on DEPARTMENT accounts,
 * never on another Admin or a Super Admin, and never on themselves for
 * privilege changes. Used by User Management to prevent escalation.
 */
export function canManageTarget(actor: AuthzUser, target: { accountType: AccountType; id: string }): boolean {
  if (actor.status !== "ACTIVE") return false;
  if (actor.accountType === "SUPER_ADMIN") return true;
  if (actor.accountType !== "ADMIN") return false;
  if (target.accountType !== "DEPARTMENT") return false;
  return actor.id !== target.id;
}

/**
 * An actor may only grant permissions they themselves hold (no escalation).
 * Returns the subset of `requested` the actor is allowed to grant.
 */
export function grantablePermissions(actor: AuthzUser, requested: PermissionMap): PermissionMap {
  if (actor.accountType === "SUPER_ADMIN") return requested;
  const mine = effectivePermissions(actor);
  const out: PermissionMap = {};
  for (const [module, actions] of Object.entries(requested)) {
    if (!actions) continue;
    const m = module as Module;
    const held = mine[m] ?? [];
    const allowed = actions.filter((a) => held.includes(a) || held.includes("Manage"));
    if (allowed.length) out[m] = allowed;
  }
  return out;
}

/**
 * Expresses a chosen permission set relative to a base (role) as add/remove, so
 * that `effectivePermissions(role + add - remove) === chosen`. Used when a Super
 * Admin assigns a role then adjusts the matrix before saving.
 */
export function diffPermissions(base: PermissionMap, chosen: PermissionMap): PermissionOverrides {
  const add: PermissionMap = {};
  const remove: PermissionMap = {};
  for (const module of MODULE_NAMES) {
    const b = new Set(base[module] ?? []);
    const c = new Set(chosen[module] ?? []);
    const added = [...c].filter((a) => !b.has(a)) as Action[];
    const removed = [...b].filter((a) => !c.has(a)) as Action[];
    if (added.length) add[module] = added;
    if (removed.length) remove[module] = removed;
  }
  const out: PermissionOverrides = {};
  if (Object.keys(add).length) out.add = add;
  if (Object.keys(remove).length) out.remove = remove;
  return out;
}

/** Normalises a raw matrix (module -> actions) to only valid module/action pairs. */
export function cleanPermissionMap(input: Record<string, string[]>): PermissionMap {
  return parsePermissionMap(JSON.stringify(input));
}

export class PermissionError extends Error {
  constructor(public module: Module, public action: Action) {
    super(`Not permitted: ${action} on ${module}.`);
    this.name = "PermissionError";
  }
}
