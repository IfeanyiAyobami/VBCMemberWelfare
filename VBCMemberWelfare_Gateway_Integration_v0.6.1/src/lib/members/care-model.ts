import type { MemberRecord } from "./model";

export const PREFERENCE_LABELS = {
  contact_consent: "Visit and follow-up contact",
  email_opt_in: "Email",
  sms_opt_in: "SMS",
  celebrations_opt_in: "Birthday and anniversary greetings",
  programmes_opt_in: "Programme invitations",
  newsletters_opt_in: "Monthly newsletter",
} as const;
export type Preferences = MemberRecord["preferences"];
export type CareNote = {
  id: string;
  body: string;
  created_at: string;
  author: string;
};
export type ConsentEvent = {
  id: string;
  preference: keyof Preferences;
  previous_value: boolean | null;
  new_value: boolean;
  source: string;
  policy_version: string;
  evidence_note: string | null;
  recorded_at: string;
  author: string;
};
export type CarePage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export function validVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
export function validatePreferences(value: unknown): value is Preferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return (
    Object.keys(p).length === 6 &&
    Object.keys(PREFERENCE_LABELS).every((k) => typeof p[k] === "boolean") &&
    Object.keys(p).every((k) => Object.hasOwn(PREFERENCE_LABELS, k))
  );
}
export function validEvidence(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= 10 &&
    value.trim().length <= 2000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  );
}
export function validNote(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 4000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  );
}
