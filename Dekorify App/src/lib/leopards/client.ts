/**
 * Leopards Courier (Pakistan) API client.
 *
 * Endpoints, verified live against the API on 2026-08-30 by sending a known-bad
 * key and checking which paths answer with a JSON auth error rather than a 404:
 *
 *   POST {base}/api/bookPacket/format/json/
 *   POST {base}/api/trackBookedPacket/format/json/
 *   POST {base}/api/cancelBookedPackets/format/json
 *   POST {base}/api/getAllCities/format/json/
 *
 *   production base : https://merchantapi.leopardscourier.com
 *
 * Older Leopards documentation shows a `/webservice/` prefix; that now returns
 * 404 on every path. The staging host (new.leopardscod.com) no longer resolves.
 *
 * Authentication is `api_key` + `api_password` in the request body — Leopards
 * has no header-based auth and no OAuth.
 *
 * The *response* shapes are not published. Everything below therefore reads
 * responses defensively: it accepts the field spellings Leopards is known to
 * use, falls back through alternatives, and always keeps the raw JSON so a
 * mismatch can be diagnosed from the sync log rather than guessed at.
 */

export const LEOPARDS_BASE_URLS = {
  production: "https://merchantapi.leopardscourier.com",
  // The old staging host (new.leopardscod.com) no longer resolves at all. This
  // one does, but answered 504 when last checked — treat staging as unreliable
  // and prefer production unless Leopards tell you otherwise.
  staging: "https://merchantapistaging.leopardscourier.com",
} as const;

export type LeopardsEnvironment = keyof typeof LEOPARDS_BASE_URLS;

export const LEOPARDS_ENDPOINTS = {
  bookPacket: "/api/bookPacket/format/json/",
  trackBookedPacket: "/api/trackBookedPacket/format/json/",
  cancelBookedPackets: "/api/cancelBookedPackets/format/json/",
  getAllCities: "/api/getAllCities/format/json/",
} as const;

export interface LeopardsCredentials {
  apiKey: string;
  apiPassword: string;
  environment: LeopardsEnvironment;
}

export class LeopardsError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LeopardsError";
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

/** Raw POST returning the parsed body plus the original text for logging. */
export async function leopardsPost(
  credentials: LeopardsCredentials,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ data: Record<string, unknown>; raw: string }> {
  return post(credentials, endpoint, body);
}

async function post(
  credentials: LeopardsCredentials,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ data: Record<string, unknown>; raw: string }> {
  const base = LEOPARDS_BASE_URLS[credentials.environment] ?? LEOPARDS_BASE_URLS.production;
  const url = `${base}${endpoint}`;

  const payload = {
    api_key: credentials.apiKey,
    api_password: credentials.apiPassword,
    ...body,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    const aborted = (error as Error).name === "AbortError";
    throw new LeopardsError(
      aborted
        ? "Leopards did not respond within 30 seconds."
        : `Could not reach Leopards: ${(error as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();

  if (!response.ok) {
    throw new LeopardsError(
      `Leopards returned HTTP ${response.status}.`,
      raw.slice(0, 2000),
      response.status,
    );
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // A wrong key usually produces an HTML error page rather than JSON.
    throw new LeopardsError(
      "Leopards returned a response that was not JSON. Check the API key and password.",
      raw.slice(0, 2000),
    );
  }

  // Leopards signals failure in the body with status 0, not an HTTP code.
  if (isFailure(data)) {
    throw new LeopardsError(errorText(data) || "Leopards rejected the request.", raw.slice(0, 2000));
  }

  return { data, raw };
}

function isFailure(data: Record<string, unknown>): boolean {
  const status = data.status ?? data.Status;
  if (status === undefined || status === null) return false;
  const normalised = String(status).trim().toLowerCase();
  return normalised === "0" || normalised === "false" || normalised === "error";
}

function errorText(data: Record<string, unknown>): string {
  const candidates = [data.error, data.Error, data.message, data.Message, data.error_msg];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (Array.isArray(candidate) && candidate.length > 0) return candidate.join("; ");
  }
  return "";
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export interface BookPacketInput {
  /** Our order reference, echoed back by Leopards. */
  orderId: string;
  weightGrams: number;
  pieces: number;
  /** Cash to collect, in whole rupees. Zero for a prepaid order. */
  collectAmount: number;

  originCityId: string;
  destinationCityId: string;

  /** Shipper — the store. */
  shipperName: string;
  shipperEmail: string;
  shipperPhone: string;
  shipperAddress: string;
  returnAddress: string;

  /** Consignee — the customer. */
  consigneeName: string;
  consigneeEmail?: string;
  consigneePhone: string;
  consigneePhoneTwo?: string;
  consigneeAddress: string;

  specialInstructions?: string;
  /** Leopards service level. "overnight" is the common default. */
  shipmentType?: string;
}

export interface BookPacketResult {
  trackingNumber: string;
  slipLink: string | null;
  raw: string;
}

export async function bookPacket(
  credentials: LeopardsCredentials,
  input: BookPacketInput,
): Promise<BookPacketResult> {
  const { data, raw } = await post(credentials, LEOPARDS_ENDPOINTS.bookPacket, {
    booked_packet_weight: input.weightGrams,
    booked_packet_vol_weight_w: null,
    booked_packet_vol_weight_h: null,
    booked_packet_vol_weight_l: null,
    booked_packet_no_piece: String(input.pieces),
    booked_packet_collect_amount: String(input.collectAmount),
    booked_packet_order_id: input.orderId,
    origin_city: input.originCityId,
    destination_city: input.destinationCityId,
    shipment_name_eng: input.shipperName,
    shipment_email: input.shipperEmail,
    shipment_phone: input.shipperPhone,
    shipment_address: input.shipperAddress,
    return_address: input.returnAddress,
    consignment_name_eng: input.consigneeName,
    consignment_email: input.consigneeEmail ?? "",
    consignment_phone: input.consigneePhone,
    consignment_phone_two: input.consigneePhoneTwo ?? null,
    consignment_phone_three: null,
    consignment_address: input.consigneeAddress,
    special_instructions: input.specialInstructions ?? "",
    shipment_type: input.shipmentType ?? "overnight",
  });

  const trackingNumber = firstString(data, [
    "track_number",
    "cn_number",
    "cn",
    "trackNumber",
    "booked_packet_track_number",
  ]);

  if (!trackingNumber) {
    throw new LeopardsError(
      "Leopards accepted the booking but did not return a CN number.",
      raw.slice(0, 2000),
    );
  }

  return {
    trackingNumber,
    slipLink: firstString(data, ["slip_link", "slipLink", "slip"]) ?? null,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export interface LeopardsTrackEvent {
  status: string;
  occurredAt: Date | null;
  location: string | null;
  remarks: string | null;
  receiverName: string | null;
}

export interface LeopardsPacket {
  trackingNumber: string;
  currentStatus: string | null;
  originCity: string | null;
  destinationCity: string | null;
  consigneeName: string | null;
  bookedAt: Date | null;
  deliveredAt: Date | null;
  events: LeopardsTrackEvent[];
}

export interface TrackResult {
  packets: LeopardsPacket[];
  raw: string;
}

/**
 * Leopards accepts a comma-separated list of CN numbers. Keep batches modest —
 * a very long list makes the whole call fail rather than degrade.
 */
export const TRACK_BATCH_SIZE = 20;

export async function trackBookedPackets(
  credentials: LeopardsCredentials,
  trackingNumbers: string[],
): Promise<TrackResult> {
  if (trackingNumbers.length === 0) return { packets: [], raw: "" };

  const { data, raw } = await post(credentials, LEOPARDS_ENDPOINTS.trackBookedPacket, {
    track_numbers: trackingNumbers.join(","),
  });

  return { packets: parsePackets(data), raw };
}

/**
 * Leopards has published several spellings of the tracking payload over time,
 * so the list and its event array are both located by trying the known keys in
 * turn rather than assuming one shape.
 */
function parsePackets(data: Record<string, unknown>): LeopardsPacket[] {
  const list =
    firstArray(data, ["packet_list", "packetList", "packets", "data", "result"]) ?? [];

  return list.map((entry) => {
    const packet = entry as Record<string, unknown>;

    const events =
      firstArray(packet, ["TrackDetail", "track_detail", "trackDetail", "tracking_detail", "details"]) ??
      [];

    return {
      trackingNumber:
        firstString(packet, ["track_number", "cn_number", "trackNumber", "cn"]) ?? "",
      currentStatus: firstString(packet, [
        "booked_packet_status",
        "packet_status",
        "status_name",
        "current_status",
        "status",
      ]),
      originCity: firstString(packet, ["origin_city_name", "origin_city", "originCity"]),
      destinationCity: firstString(packet, [
        "destination_city_name",
        "destination_city",
        "destinationCity",
      ]),
      consigneeName: firstString(packet, ["consignment_name_eng", "consignee_name", "consignment_name"]),
      bookedAt: parseLeopardsDate(
        firstString(packet, ["booking_date", "booked_packet_date", "bookingDate"]),
        null,
      ),
      deliveredAt: parseLeopardsDate(
        firstString(packet, ["delivery_date", "delivered_date", "deliveryDate"]),
        null,
      ),
      events: events
        .map((raw) => parseEvent(raw as Record<string, unknown>))
        .filter((event): event is LeopardsTrackEvent => event !== null),
    };
  });
}

function parseEvent(entry: Record<string, unknown>): LeopardsTrackEvent | null {
  const status = firstString(entry, [
    "Status",
    "status",
    "activity",
    "Activity",
    "packet_status",
  ]);
  if (!status) return null;

  const date = firstString(entry, ["Activity_Date", "activity_date", "Date", "date", "activity_datetime"]);
  const time = firstString(entry, ["Activity_Time", "activity_time", "Time", "time"]);

  return {
    status,
    occurredAt: parseLeopardsDate(date, time),
    location: firstString(entry, [
      "Activity_Location",
      "activity_location",
      "Location",
      "location",
      "ReceivedBy_Location",
      "origin_city_name",
    ]),
    remarks: firstString(entry, ["Comments", "comments", "Remarks", "remarks", "reason"]),
    receiverName: firstString(entry, ["Reciever_Name", "Receiver_Name", "receiver_name", "received_by"]),
  };
}

// ---------------------------------------------------------------------------
// Cancellation and cities
// ---------------------------------------------------------------------------

export async function cancelBookedPackets(
  credentials: LeopardsCredentials,
  trackingNumbers: string[],
): Promise<{ raw: string }> {
  const { raw } = await post(credentials, LEOPARDS_ENDPOINTS.cancelBookedPackets, {
    cn_numbers: trackingNumbers.join(","),
  });
  return { raw };
}

export interface LeopardsCity {
  id: string;
  name: string;
}

export async function getAllCities(
  credentials: LeopardsCredentials,
): Promise<{ cities: LeopardsCity[]; raw: string }> {
  const { data, raw } = await post(credentials, LEOPARDS_ENDPOINTS.getAllCities, {});

  const list = firstArray(data, ["city_list", "cityList", "cities", "data"]) ?? [];

  const cities = list
    .map((entry) => {
      const city = entry as Record<string, unknown>;
      const id = firstString(city, ["id", "city_id", "cityId"]);
      const name = firstString(city, ["name", "city_name", "cityName"]);
      return id && name ? { id, name } : null;
    })
    .filter((city): city is LeopardsCity => city !== null);

  return { cities, raw };
}

/** Cheap credential check: cities is the lightest authenticated call. */
export async function verifyCredentials(
  credentials: LeopardsCredentials,
): Promise<{ ok: true; cityCount: number } | { ok: false; message: string }> {
  try {
    const { cities } = await getAllCities(credentials);
    return { ok: true, cityCount: cities.length };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function firstArray(source: Record<string, unknown>, keys: string[]): unknown[] | null {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

/**
 * Leopards returns dates as separate date and time strings in a handful of
 * formats. Anything unrecognised returns null rather than a wrong date — an
 * event with no timestamp is obvious, an event dated 1970 is not.
 */
export function parseLeopardsDate(date: string | null, time: string | null): Date | null {
  if (!date) return null;

  const cleanDate = date.trim();
  const cleanTime = (time ?? "").trim();

  // ISO first: 2026-08-31 or 2026-08-31 14:45:00
  let match = cleanDate.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    const fromTime = parseClock(cleanTime);
    return build(
      Number(y),
      Number(m),
      Number(d),
      hh !== undefined ? Number(hh) : fromTime.hours,
      mm !== undefined ? Number(mm) : fromTime.minutes,
      ss !== undefined ? Number(ss) : fromTime.seconds,
    );
  }

  // Day-first: 31-08-2026 or 31/08/2026
  match = cleanDate.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    const [, d, m, y] = match;
    const fromTime = parseClock(cleanTime);
    return build(Number(y), Number(m), Number(d), fromTime.hours, fromTime.minutes, fromTime.seconds);
  }

  const loose = new Date(cleanTime ? `${cleanDate} ${cleanTime}` : cleanDate);
  return Number.isNaN(loose.getTime()) ? null : loose;
}

function parseClock(value: string): { hours: number; minutes: number; seconds: number } {
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/);
  if (!match) return { hours: 0, minutes: 0, seconds: 0 };

  let hours = Number(match[1]);
  const meridiem = match[4]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  return { hours, minutes: Number(match[2]), seconds: match[3] ? Number(match[3]) : 0 };
}

function build(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number,
): Date | null {
  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  return Number.isNaN(date.getTime()) || date.getMonth() !== month - 1 ? null : date;
}
