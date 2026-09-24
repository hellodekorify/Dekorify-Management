import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Build a query string, dropping empty values so URLs stay readable. */
export function buildQuery(
  base: Record<string, string | number | null | undefined>,
  overrides: Record<string, string | number | null | undefined> = {},
): string {
  const params = new URLSearchParams();
  const merged = { ...base, ...overrides };

  for (const [key, value] of Object.entries(merged)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function truncate(text: string, length = 40): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/** Turn a Zod-style field error map into a flat record for form rendering. */
export function firstErrors(
  errors: Record<string, string[] | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, messages] of Object.entries(errors)) {
    if (messages?.[0]) result[key] = messages[0];
  }
  return result;
}
