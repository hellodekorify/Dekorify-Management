"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { applyManualStatus, recomputeShipment, recordTrackingEvents } from "@/lib/orders/tracking";
import { ORDER_STATUSES } from "@/lib/orders/statuses";
import { bookShipment, syncTracking } from "@/lib/leopards/sync";
import { ensureDefaultMappings, ensureLeopardsCourier, resolveCredentials } from "@/lib/leopards/courier";
import { verifyCredentials } from "@/lib/leopards/client";
import { firstErrors } from "@/lib/utils";
import type { FormState } from "./auth";

const STATUS_VALUES = ORDER_STATUSES.map((status) => status.value) as [string, ...string[]];

export interface ActionResult {
  ok: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Manual overrides
// ---------------------------------------------------------------------------

export async function updateOrderStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, store } = await requireContext();

  const parsed = z
    .object({
      orderId: z.string().min(1),
      status: z.enum(STATUS_VALUES),
      note: z.string().trim().max(2000).optional(),
    })
    .safeParse({
      orderId: formData.get("orderId"),
      status: formData.get("status"),
      note: formData.get("note") ?? undefined,
    });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const order = await prisma.order.findFirst({
    where: { id: parsed.data.orderId, storeId: store.id, deletedAt: null },
    select: { id: true, status: true, orderNumber: true },
  });
  if (!order) return { ok: false, message: "That order no longer exists." };

  await applyManualStatus({
    orderId: order.id,
    status: parsed.data.status,
    userId: user.id,
    note: parsed.data.note,
  });

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "Order",
    entityId: order.id,
    action: "UPDATE",
    summary: `Set ${order.orderNumber} to ${parsed.data.status} manually`,
    before: { status: order.status },
    after: { status: parsed.data.status },
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  return { ok: true, message: "Status updated." };
}

export async function addOrderNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, store } = await requireContext();

  const parsed = z
    .object({
      orderId: z.string().min(1),
      body: z.string().trim().min(1, "Write something first.").max(2000),
      kind: z.enum(["NOTE", "ISSUE", "RESOLUTION"]).default("NOTE"),
    })
    .safeParse({
      orderId: formData.get("orderId"),
      body: formData.get("body"),
      kind: formData.get("kind") || "NOTE",
    });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const order = await prisma.order.findFirst({
    where: { id: parsed.data.orderId, storeId: store.id, deletedAt: null },
    select: { id: true },
  });
  if (!order) return { ok: false, message: "That order no longer exists." };

  await prisma.orderNote.create({
    data: {
      storeId: store.id,
      orderId: order.id,
      userId: user.id,
      body: parsed.data.body,
      kind: parsed.data.kind,
    },
  });

  // An explicitly flagged issue puts the order on the issues board.
  if (parsed.data.kind === "ISSUE") {
    await prisma.order.update({
      where: { id: order.id },
      data: { hasIssue: true, issueReason: parsed.data.body.slice(0, 120) },
    });
  }
  if (parsed.data.kind === "RESOLUTION") {
    await prisma.order.update({
      where: { id: order.id },
      data: { hasIssue: false, issueReason: null },
    });
  }

  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/orders/issues");
  return { ok: true, message: "Note added." };
}

export async function setTrackingNumberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, store } = await requireContext();

  const parsed = z
    .object({
      orderId: z.string().min(1),
      trackingNumber: z.string().trim().min(3, "Enter the CN number.").max(60),
      courierId: z.string().optional(),
    })
    .safeParse({
      orderId: formData.get("orderId"),
      trackingNumber: formData.get("trackingNumber"),
      courierId: formData.get("courierId") ?? undefined,
    });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const order = await prisma.order.findFirst({
    where: { id: parsed.data.orderId, storeId: store.id, deletedAt: null },
    select: { id: true, orderNumber: true },
  });
  if (!order) return { ok: false, message: "That order no longer exists." };

  const clash = await prisma.shipment.findUnique({
    where: { storeId_trackingNumber: { storeId: store.id, trackingNumber: parsed.data.trackingNumber } },
    select: { orderId: true },
  });
  if (clash && clash.orderId !== order.id) {
    return {
      ok: false,
      errors: { trackingNumber: "That CN number is already on another order." },
    };
  }

  const courierId =
    parsed.data.courierId ||
    (
      await prisma.courier.findFirst({
        where: { storeId: store.id, deletedAt: null, isDefault: true },
        select: { id: true },
      })
    )?.id ||
    null;

  const shipment =
    clash?.orderId === order.id
      ? await prisma.shipment.findUnique({
          where: {
            storeId_trackingNumber: {
              storeId: store.id,
              trackingNumber: parsed.data.trackingNumber,
            },
          },
        })
      : await prisma.shipment.create({
          data: {
            storeId: store.id,
            orderId: order.id,
            courierId,
            trackingNumber: parsed.data.trackingNumber,
            status: "SHIPMENT_CREATED",
            bookedAt: new Date(),
            courierOrderId: order.orderNumber,
          },
        });

  if (shipment) {
    await recordTrackingEvents(shipment.id, [
      {
        occurredAt: new Date(),
        source: "MANUAL",
        internalStatus: "SHIPMENT_CREATED",
        description: `Tracking number ${parsed.data.trackingNumber} added by hand`,
        userId: user.id,
      },
    ]);
    await recomputeShipment(shipment.id);
  }

  await recordAudit({
    storeId: store.id,
    userId: user.id,
    entity: "Order",
    entityId: order.id,
    action: "UPDATE",
    summary: `Added CN ${parsed.data.trackingNumber} to ${order.orderNumber}`,
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  return { ok: true, message: "Tracking number saved." };
}

export async function addDeliveryAttemptAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, store } = await requireContext();

  const parsed = z
    .object({
      orderId: z.string().min(1),
      status: z.enum(STATUS_VALUES),
      reason: z.string().trim().max(500).optional(),
      location: z.string().trim().max(120).optional(),
      occurredAt: z.string().optional(),
    })
    .safeParse({
      orderId: formData.get("orderId"),
      status: formData.get("status"),
      reason: formData.get("reason") ?? undefined,
      location: formData.get("location") ?? undefined,
      occurredAt: formData.get("occurredAt") ?? undefined,
    });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const order = await prisma.order.findFirst({
    where: { id: parsed.data.orderId, storeId: store.id, deletedAt: null },
    include: { shipments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!order) return { ok: false, message: "That order no longer exists." };

  const shipment = order.shipments[0];
  if (!shipment) {
    return {
      ok: false,
      message: "Add a tracking number first — a delivery attempt belongs to a shipment.",
    };
  }

  const when = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
  if (Number.isNaN(when.getTime())) {
    return { ok: false, errors: { occurredAt: "That is not a valid date and time." } };
  }

  await recordTrackingEvents(shipment.id, [
    {
      occurredAt: when,
      source: "MANUAL",
      internalStatus: parsed.data.status,
      location: parsed.data.location,
      description: parsed.data.reason ?? "Recorded by hand",
      userId: user.id,
    },
  ]);
  await recomputeShipment(shipment.id);

  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/orders/issues");
  return { ok: true, message: "Delivery attempt recorded." };
}

// ---------------------------------------------------------------------------
// Courier operations
// ---------------------------------------------------------------------------

export async function bookShipmentAction(orderId: string): Promise<ActionResult> {
  const { user, store } = await requireContext();

  const result = await bookShipment(store.id, orderId);

  if (result.ok) {
    await recordAudit({
      storeId: store.id,
      userId: user.id,
      entity: "Order",
      entityId: orderId,
      action: "UPDATE",
      summary: result.message,
    });
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: result.ok, message: result.message };
}

export async function syncTrackingAction(): Promise<ActionResult> {
  const { store } = await requireContext();
  const result = await syncTracking(store.id, { trigger: "MANUAL" });

  revalidatePath("/orders");
  revalidatePath("/orders/issues");
  revalidatePath("/settings/couriers");
  return { ok: result.ok, message: result.message };
}

export async function syncOneOrderAction(orderId: string): Promise<ActionResult> {
  const { store } = await requireContext();

  const shipments = await prisma.shipment.findMany({
    where: { orderId, storeId: store.id, deletedAt: null, trackingNumber: { not: null } },
    select: { id: true },
  });

  if (shipments.length === 0) {
    return { ok: false, message: "This order has no tracking number to check." };
  }

  const result = await syncTracking(store.id, {
    trigger: "MANUAL",
    shipmentIds: shipments.map((shipment) => shipment.id),
  });

  revalidatePath(`/orders/${orderId}`);
  return { ok: result.ok, message: result.message };
}

// ---------------------------------------------------------------------------
// Courier settings
// ---------------------------------------------------------------------------

export async function saveCourierSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { store } = await requireContext();

  const parsed = z
    .object({
      apiKey: z.string().trim().max(200).optional(),
      apiPassword: z.string().trim().max(200).optional(),
      apiEnvironment: z.enum(["production", "staging"]).default("production"),
      originCityId: z.string().trim().max(40).optional(),
      returnAddress: z.string().trim().max(400).optional(),
    })
    .safeParse({
      apiKey: formData.get("apiKey") ?? undefined,
      apiPassword: formData.get("apiPassword") ?? undefined,
      apiEnvironment: formData.get("apiEnvironment") || "production",
      originCityId: formData.get("originCityId") ?? undefined,
      returnAddress: formData.get("returnAddress") ?? undefined,
    });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const courierId = await ensureLeopardsCourier(store.id);

  await prisma.courier.update({
    where: { id: courierId },
    data: {
      // A blank key means "leave what is there" rather than "erase it", so the
      // form can be re-saved without retyping the secret.
      ...(parsed.data.apiKey ? { apiKey: parsed.data.apiKey } : {}),
      ...(parsed.data.apiPassword ? { apiPassword: parsed.data.apiPassword } : {}),
      apiEnvironment: parsed.data.apiEnvironment,
      originCityId: parsed.data.originCityId || null,
      returnAddress: parsed.data.returnAddress || null,
    },
  });

  revalidatePath("/settings/couriers");
  return { ok: true, message: "Courier settings saved." };
}

export async function testCourierConnectionAction(): Promise<ActionResult> {
  const { store } = await requireContext();

  const courier = await prisma.courier.findUnique({
    where: { storeId_code: { storeId: store.id, code: "LEOPARDS" } },
  });
  if (!courier) return { ok: false, message: "Leopards is not set up yet. Save your settings first." };

  const credentials = resolveCredentials(courier);
  if (!credentials) {
    return {
      ok: false,
      message: "No API key and password found — add them below or set them in the environment.",
    };
  }

  const result = await verifyCredentials(credentials);

  await prisma.courier.update({
    where: { id: courier.id },
    data: result.ok
      ? { lastSyncOkAt: new Date(), lastSyncError: null }
      : { lastSyncError: result.message },
  });

  revalidatePath("/settings/couriers");

  return result.ok
    ? { ok: true, message: `Connected. Leopards returned ${result.cityCount} cities.` }
    : { ok: false, message: result.message };
}

export async function restoreDefaultMappingsAction(): Promise<ActionResult> {
  const { store } = await requireContext();

  const courierId = await ensureLeopardsCourier(store.id);
  const added = await ensureDefaultMappings(courierId);

  revalidatePath("/settings/couriers");
  return {
    ok: true,
    message: added === 0 ? "All default mappings are already present." : `Added ${added} missing mapping${added === 1 ? "" : "s"}.`,
  };
}

export async function saveStatusMappingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { store } = await requireContext();

  const parsed = z
    .object({
      id: z.string().optional(),
      courierStatus: z.string().trim().min(1, "Enter the courier's wording.").max(160),
      internalStatus: z.enum(STATUS_VALUES),
      isIssue: z.coerce.boolean().default(false),
      isAttempt: z.coerce.boolean().default(false),
      isTerminal: z.coerce.boolean().default(false),
    })
    .safeParse({
      id: formData.get("id") ?? undefined,
      courierStatus: formData.get("courierStatus"),
      internalStatus: formData.get("internalStatus"),
      isIssue: formData.get("isIssue") === "on",
      isAttempt: formData.get("isAttempt") === "on",
      isTerminal: formData.get("isTerminal") === "on",
    });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const courierId = await ensureLeopardsCourier(store.id);
  const courierStatus = parsed.data.courierStatus.toLowerCase();

  const data = {
    internalStatus: parsed.data.internalStatus,
    isIssue: parsed.data.isIssue,
    isAttempt: parsed.data.isAttempt,
    isTerminal: parsed.data.isTerminal,
  };

  if (parsed.data.id) {
    const existing = await prisma.courierStatusMapping.findFirst({
      where: { id: parsed.data.id, courierId },
    });
    if (!existing) return { ok: false, message: "That mapping no longer exists." };
    await prisma.courierStatusMapping.update({
      where: { id: parsed.data.id },
      data: { ...data, courierStatus },
    });
  } else {
    await prisma.courierStatusMapping.upsert({
      where: { courierId_courierStatus: { courierId, courierStatus } },
      update: data,
      create: { courierId, courierStatus, ...data },
    });
  }

  revalidatePath("/settings/couriers");
  return { ok: true, message: "Mapping saved." };
}

export async function deleteStatusMappingAction(id: string): Promise<ActionResult> {
  const { store } = await requireContext();

  const mapping = await prisma.courierStatusMapping.findFirst({
    where: { id, courier: { storeId: store.id } },
  });
  if (!mapping) return { ok: false, message: "That mapping no longer exists." };

  await prisma.courierStatusMapping.delete({ where: { id } });

  revalidatePath("/settings/couriers");
  return { ok: true, message: "Mapping removed." };
}

/** City name to Leopards city ID, stored alongside the status mappings. */
export async function saveCityMappingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { store } = await requireContext();

  const parsed = z
    .object({
      cityName: z.string().trim().min(1, "Enter the city name as it appears on orders.").max(80),
      cityId: z.string().trim().min(1, "Enter the Leopards city ID.").max(20),
    })
    .safeParse({ cityName: formData.get("cityName"), cityId: formData.get("cityId") });

  if (!parsed.success) {
    return { ok: false, errors: firstErrors(parsed.error.flatten().fieldErrors) };
  }

  const courierId = await ensureLeopardsCourier(store.id);
  const key = `city:${parsed.data.cityName.toLowerCase()}`;

  await prisma.courierStatusMapping.upsert({
    where: { courierId_courierStatus: { courierId, courierStatus: key } },
    update: { internalStatus: parsed.data.cityId },
    create: { courierId, courierStatus: key, internalStatus: parsed.data.cityId },
  });

  revalidatePath("/settings/couriers");
  return { ok: true, message: `${parsed.data.cityName} mapped to city ID ${parsed.data.cityId}.` };
}
