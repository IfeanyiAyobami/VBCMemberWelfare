import {
  normalizeMemberPhone,
  todayInLagos,
  validMilestone,
  isMemberId,
  type FieldErrors,
} from "../members/model";
import {
  PREFERENCE_LABELS,
  type Preferences,
  validEvidence,
} from "../members/care-model";
export const GUEST_OPTIONS = {
  gender: ["Male", "Female"],
  age_range: [
    "Less than 18",
    "18-24",
    "25-34",
    "35-44",
    "45-59",
    "60 and above",
  ],
  marital_status: ["Single", "Married", "Others"],
  born_again: ["Yes", "No"],
  home_visit: ["Yes", "No"],
  discovery_source: [
    "Family",
    "Friends / Acquaintance",
    "Church evangelism / Outreach",
    "Social media",
    "Flyers",
    "Other",
  ],
} as const;
export const GUEST_LIMITS = {
  surname: 100,
  other_names: 120,
  visit_date: 10,
  occupation: 150,
  gender: 20,
  age_range: 30,
  marital_status: 20,
  phone: 50,
  whatsapp: 50,
  email: 254,
  residential_address: 600,
  born_again: 10,
  home_visit: 10,
  discovery_source: 80,
  discovery_details: 1000,
  invited_by: 400,
  birthday: 5,
  anniversary: 5,
} as const;
export type GuestDraft = Record<keyof typeof GUEST_LIMITS, string> &
  Preferences;
export const GUEST_STATUSES = {
  pending: "Pending review",
  accepted: "Member created",
  duplicate: "Linked to member",
  rejected: "Rejected",
  unlinked: "Needs relinking",
} as const;
export type GuestRecord = GuestDraft & {
  id: string;
  version: string;
  source: string;
  createdAt: string;
  status: keyof typeof GUEST_STATUSES;
  memberId: string | null;
  reviewNotes: string;
  reviewedAt: string | null;
  reviewer: string;
  enteredBy: string;
  evidence: string;
  policy: string;
};
export type Match = {
  id: string;
  version: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  archivedAt: string | null;
  matchEmail: boolean;
  matchPhone: boolean;
};
export function emptyGuest(): GuestDraft {
  return {
    ...Object.fromEntries(Object.keys(GUEST_LIMITS).map((k) => [k, ""])),
    ...Object.fromEntries(
      Object.keys(PREFERENCE_LABELS).map((k) => [k, false]),
    ),
    visit_date: todayInLagos(),
  } as GuestDraft;
}
export function validateGuest(
  input: unknown,
  today = todayInLagos(),
): { ok: true; value: GuestDraft } | { ok: false; errors: FieldErrors } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, errors: { _form: "Enter the guest details." } };
  const d = input as Record<string, unknown>,
    errors: FieldErrors = {},
    v = emptyGuest();
  for (const [key, max] of Object.entries(GUEST_LIMITS)) {
    const value = d[key],
      text = typeof value === "string" ? value.trim() : "";
    if (
      typeof value !== "string" ||
      text.length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
    )
      errors[key] = "Use text of at most " + max + " characters.";
    v[key as keyof typeof GUEST_LIMITS] = text;
  }
  for (const key of Object.keys(PREFERENCE_LABELS) as (keyof Preferences)[]) {
    if (typeof d[key] !== "boolean") errors[key] = "Choose on or off.";
    v[key] = d[key] === true;
  }
  for (const key of ["surname", "other_names"] as const)
    if (!v[key]) errors[key] = "This field is required.";
  for (const [key, options] of Object.entries(GUEST_OPTIONS))
    if (
      v[key as keyof typeof GUEST_OPTIONS] &&
      !(options as readonly string[]).includes(
        v[key as keyof typeof GUEST_OPTIONS],
      )
    )
      errors[key] = "Choose one of the listed options.";
  for (const key of ["phone", "whatsapp"] as const) {
    const n = normalizeMemberPhone(v[key]);
    if (n === null)
      errors[key] = "Use a Nigerian number or include the country code.";
    else v[key] = n;
  }
  if (!v.phone && !errors.phone)
    errors.phone = "A mobile number is required on the guest card.";
  v.email = v.email.toLowerCase();
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))
    errors.email = "Enter a valid email or leave it blank.";
  if (v.email_opt_in && !v.email)
    errors.email = "Record an email address for email permission.";
  const date = new Date(v.visit_date + "T12:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v.visit_date) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== v.visit_date ||
    v.visit_date < "1900-01-01" ||
    v.visit_date > today
  )
    errors.visit_date = "Choose a valid visit date up to today.";
  for (const key of ["birthday", "anniversary"] as const)
    if (!validMilestone(v[key]))
      errors[key] = "Choose a valid month and day; February 29 is allowed.";
  if (!v.contact_consent)
    errors.contact_consent =
      "The guest card requires permission for visit follow-up.";
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: v };
}
export function guestColumns(v: GuestDraft) {
  const { birthday, anniversary, ...fields } = v;
  const pair = (s: string) => (s ? s.split("-").map(Number) : [null, null]);
  const [birthday_month, birthday_day] = pair(birthday),
    [anniversary_month, anniversary_day] = pair(anniversary);
  const text = Object.fromEntries(
    Object.keys(GUEST_LIMITS)
      .filter((k) => k !== "birthday" && k !== "anniversary")
      .map((k) => [k, v[k as keyof typeof GUEST_LIMITS] || null]),
  );
  return {
    ...fields,
    ...text,
    birthday_month,
    birthday_day,
    anniversary_month,
    anniversary_day,
  };
}
export function validGuestEnvelope(data: Record<string, unknown>) {
  return isMemberId(data.requestId) && validEvidence(data.evidence);
}
