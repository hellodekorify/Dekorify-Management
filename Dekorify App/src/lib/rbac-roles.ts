import { prisma } from "./db";
import { MODULE_NAMES, serialisePermissionMap, type Module, type PermissionMap } from "./rbac";

// =============================================================================
// System roles
//
// Seeded, named starting points a Super Admin can assign as-is or copy and
// adjust. They are examples, not a fixed set — the Super Admin can create and
// customise roles. `isSystem` roles cannot be deleted, only edited/copied.
// =============================================================================

export interface SystemRole {
  name: string;
  description: string;
  permissions: PermissionMap;
}

/** View on every module that supports it — used by the Read-Only role. */
function viewAll(): PermissionMap {
  const map: PermissionMap = {};
  for (const module of MODULE_NAMES) {
    // Only operational modules, not the admin ones.
    if (module === "User Management" || module === "Roles & Permissions") continue;
    map[module as Module] = ["View"];
  }
  return map;
}

export const SYSTEM_ROLES: SystemRole[] = [
  {
    name: "Admin",
    description:
      "Broad operational access across orders, finance, products and reports. Does not include user or role management unless granted.",
    permissions: {
      Dashboard: ["View"],
      Orders: ["View", "Create", "Edit", "Approve", "Export", "Manage"],
      Products: ["View", "Create", "Edit", "Export", "Manage"],
      Inventory: ["View", "Edit", "Export", "Manage"],
      Customers: ["View", "Edit", "Export"],
      Finance: ["View", "Create", "Edit", "Approve", "Export", "Manage"],
      Reports: ["View", "Export"],
      "Customer Support": ["View", "Create", "Edit", "Manage"],
      Integrations: ["View", "Manage"],
      "Application Settings": ["View"],
      "Audit Logs": ["View", "Export"],
    },
  },
  {
    name: "Finance Manager",
    description: "Full control of finance records and reports, plus approvals.",
    permissions: {
      Dashboard: ["View"],
      Finance: ["View", "Create", "Edit", "Delete", "Approve", "Export", "Manage"],
      Reports: ["View", "Export"],
    },
  },
  {
    name: "Finance Executive",
    description: "Day-to-day finance entry and export, without delete or approval.",
    permissions: {
      Dashboard: ["View"],
      Finance: ["View", "Create", "Edit", "Export"],
      Reports: ["View", "Export"],
    },
  },
  {
    name: "Customer Support",
    description: "View and update orders and customer records for support.",
    permissions: {
      Dashboard: ["View"],
      Orders: ["View", "Edit"],
      Customers: ["View", "Edit"],
      "Customer Support": ["View", "Create", "Edit", "Manage"],
    },
  },
  {
    name: "Operations Manager",
    description: "Manages order fulfilment, products, inventory and courier integrations.",
    permissions: {
      Dashboard: ["View"],
      Orders: ["View", "Create", "Edit", "Approve", "Export", "Manage"],
      Products: ["View", "Create", "Edit", "Export", "Manage"],
      Inventory: ["View", "Edit", "Export", "Manage"],
      Integrations: ["View", "Manage"],
      Reports: ["View", "Export"],
    },
  },
  {
    name: "Inventory Manager",
    description: "Manages stock levels and the product catalogue.",
    permissions: {
      Dashboard: ["View"],
      Products: ["View", "Edit", "Export"],
      Inventory: ["View", "Edit", "Export", "Manage"],
    },
  },
  {
    name: "Marketing Executive",
    description: "Views advertising spend and performance reports.",
    permissions: {
      Dashboard: ["View"],
      Finance: ["View"],
      Reports: ["View", "Export"],
    },
  },
  {
    name: "Read-Only User",
    description: "Can view operational data but cannot change anything.",
    permissions: viewAll(),
  },
];

/**
 * Creates any missing system roles. Idempotent; safe to call on bootstrap. Does
 * not overwrite a system role an admin has since edited (matched by name).
 */
export async function ensureSystemRoles(): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findUnique({ where: { name: role.name } });
    if (existing) continue;
    await prisma.role.create({
      data: {
        name: role.name,
        description: role.description,
        isSystem: true,
        permissions: serialisePermissionMap(role.permissions),
      },
    });
  }
}
