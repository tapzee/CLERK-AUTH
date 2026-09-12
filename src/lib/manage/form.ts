import { parseRole, type Role } from "@/lib/auth/rbac";
import { StorageError } from "@/lib/storage";

/**
 * Reading and validating console form fields.
 *
 * Server Actions receive whatever was posted, not whatever the form rendered,
 * so every field is re-validated here rather than trusted because an `<input
 * type="number">` produced it. Each helper throws a `StorageError` carrying a
 * message that is fit to show the person filling in the form.
 */

export function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function optionalText(form: FormData, key: string): string | null {
  return text(form, key) || null;
}

export function requiredText(form: FormData, key: string, label: string): string {
  const value = text(form, key);
  if (!value) throw new StorageError(`${label} is required.`, 400);
  return value;
}

export function checkbox(form: FormData, key: string): boolean {
  return form.get(key) === "on";
}

export function number(form: FormData, key: string, label: string): number {
  const parsed = Number(text(form, key));
  if (!Number.isFinite(parsed)) throw new StorageError(`${label} must be a number.`, 400);
  return parsed;
}

export function optionalNumber(form: FormData, key: string, label: string): number | null {
  const raw = text(form, key);
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new StorageError(`${label} must be a number.`, 400);
  return parsed;
}

export function integerInRange(
  form: FormData,
  key: string,
  label: string,
  min: number,
  max: number,
): number {
  const parsed = Math.round(number(form, key, label));
  if (parsed < min || parsed > max) {
    throw new StorageError(`${label} must be between ${min} and ${max}.`, 400);
  }
  return parsed;
}

export function money(form: FormData, key: string, label: string): number {
  const parsed = number(form, key, label);
  if (parsed < 0) throw new StorageError(`${label} cannot be negative.`, 400);
  return Math.round(parsed * 100) / 100;
}

/**
 * A plausible email address.
 *
 * Deliberately loose. The address is proven by Clerk at sign-in, which is the
 * only check that actually means anything; this one exists to catch a typo
 * before it becomes a staff row nobody can ever sign into.
 */
export function email(form: FormData, key: string): string {
  const value = text(form, key).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new StorageError("That does not look like an email address.", 400);
  }
  return value;
}

export function role(form: FormData, key = "role"): Role {
  const parsed = parseRole(text(form, key));
  if (!parsed) throw new StorageError("Pick a valid role.", 400);
  return parsed;
}

/** Rejects a zone the attendance trigger would later choke on. */
export function timezone(form: FormData, key = "timezone"): string {
  const zone = text(form, key) || "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
  } catch {
    throw new StorageError(`"${zone}" is not a valid timezone name.`, 400);
  }
  return zone;
}

/** A YYYY-MM-DD date, as the business_date and period_month columns store it. */
export function isoDate(form: FormData, key: string, label: string): string {
  const value = text(form, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new StorageError(`${label} must be a date.`, 400);
  }
  return value;
}

/**
 * A time input, normalised to what Postgres `time` accepts.
 *
 * `<input type="time">` posts "09:30", and with seconds enabled "09:30:00".
 * Both are fine for Postgres; an empty string is not, and means "no shift set".
 */
export function optionalTime(form: FormData, key: string): string | null {
  const value = text(form, key);
  if (!value) return null;
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    throw new StorageError("That is not a valid time.", 400);
  }
  return value;
}
