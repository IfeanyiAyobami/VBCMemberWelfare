import { emptyGuest, validateGuest, guestColumns } from "./model";
import { isMemberId } from "../members/model";

// Exact payload() contract from the installed First-Timer Gateway v1.1.3.
export const GATEWAY_LIMITS = {
  submission_id: 36,
  date_submitted: 19,
  surname: 100,
  other_names: 120,
  full_name: 221,
  visit_date: 10,
  occupation: 150,
  gender: 20,
  age_range: 30,
  marital_status: 20,
  phone: 50,
  whatsapp: 50,
  email: 254,
  address: 600,
  residential_address: 600,
  salvation_response: 10,
  born_again: 10,
  home_visitation: 10,
  home_visit: 10,
  heard_about: 1083,
  discovery_source: 80,
  discovery_details: 1000,
  invited_by: 400,
  contact_consent: 3,
} as const;
export type GatewayPayload = Record<keyof typeof GATEWAY_LIMITS, string>;
export const GATEWAY_EVIDENCE =
  'WordPress First-Timer Gateway v1.1.3 submitted contact_consent="Yes" for visitor follow-up. No email, SMS, celebration, programme or newsletter opt-in was supplied.';

export function validateGateway(input: unknown, idempotencyKey: string | null) {
  const fail = (field: string) => ({ ok: false as const, field });
  if (!input || typeof input !== "object" || Array.isArray(input))
    return fail("_body");
  const d = input as Record<string, unknown>;
  if (Object.keys(d).some((k) => !Object.hasOwn(GATEWAY_LIMITS, k)))
    return fail("_fields");
  for (const [key, max] of Object.entries(GATEWAY_LIMITS)) {
    if (
      typeof d[key] !== "string" ||
      (d[key] as string).length > max ||
      /[\u0000-\u001f\u007f]/.test(d[key] as string)
    )
      return fail(key);
  }
  const p = { ...d } as GatewayPayload;
  if (!isMemberId(p.submission_id)) return fail("submission_id");
  p.submission_id = p.submission_id.toLowerCase();
  if (!idempotencyKey || idempotencyKey.toLowerCase() !== p.submission_id)
    return fail("Idempotency-Key");
  if (p.contact_consent !== "Yes") return fail("contact_consent");
  if (p.address !== p.residential_address) return fail("address");
  if (p.salvation_response !== p.born_again) return fail("salvation_response");
  if (p.home_visitation !== p.home_visit) return fail("home_visitation");
  if (p.full_name !== (p.surname + " " + p.other_names).trim())
    return fail("full_name");
  if (
    p.heard_about !==
    p.discovery_source +
      (p.discovery_details ? " — " + p.discovery_details : "")
  )
    return fail("heard_about");
  // WordPress current_time('mysql') is site-local and has no offset. Keep it so;
  // never mislabel it UTC or infer a timezone from the HTTP receipt time.
  const s = p.date_submitted;
  const date = new Date(s.replace(" ", "T") + "Z");
  if (
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ||
    s < "1900-01-01 00:00:00" ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 19).replace("T", " ") !== s
  )
    return fail("date_submitted");
  const draft = emptyGuest();
  for (const key of [
    "surname",
    "other_names",
    "visit_date",
    "occupation",
    "gender",
    "age_range",
    "marital_status",
    "phone",
    "whatsapp",
    "email",
    "residential_address",
    "born_again",
    "home_visit",
    "discovery_source",
    "discovery_details",
    "invited_by",
  ] as const)
    draft[key] = p[key];
  draft.contact_consent = true;
  // Email is optional in the public gateway contract; no address means no email channel.
  if (!draft.email.trim()) draft.email_opt_in = false;
  // Retain existing application preference defaults; actual delivery is separately gated.
  const valid = validateGuest(draft);
  if (!valid.ok) return fail(Object.keys(valid.errors)[0]);
  return { ok: true as const, payload: p, guest: guestColumns(valid.value) };
}

export function canonicalGateway(p: GatewayPayload) {
  // Stable across JSON key order, but includes every original answer and alias.
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(GATEWAY_LIMITS)
        .sort()
        .map((k) => [k, p[k as keyof GatewayPayload]]),
    ),
  );
}
