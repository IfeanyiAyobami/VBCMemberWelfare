export const MEMBER_STATUSES = {
  visitor: "Visitor",
  new_member: "New member",
  member: "Member",
} as const;
export type MemberStatus = keyof typeof MEMBER_STATUSES;
export type MemberDraft = {
  first: string;
  last: string;
  email: string;
  phone: string;
  status: MemberStatus;
  occupation: string;
  address: string;
  birthday: string;
  anniversary: string;
  joined: string;
};
export type MemberRecord = MemberDraft & {
  id: string;
  version: string;
  archivedAt: string | null;
  preferenceVersion: string | null;
  preferenceEvidence: string;
  preferencePolicy: string;
  preferences: {
    contact_consent: boolean;
    email_opt_in: boolean;
    sms_opt_in: boolean;
    celebrations_opt_in: boolean;
    programmes_opt_in: boolean;
    newsletters_opt_in: boolean;
  };
};
export type FieldErrors = Record<string, string>;
export const isMemberId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function todayInLagos() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function normalizeMemberPhone(value: string) {
  if (!value) return "";
  if (!/^\+?[0-9 .()-]+$/.test(value)) return null;
  let n = value.replace(/\D/g, "");
  if (value.startsWith("+")) n = "+" + n;
  else if (n.startsWith("00")) n = "+" + n.slice(2);
  else if (n.length === 11 && n.startsWith("0")) n = "+234" + n.slice(1);
  else if (n.length === 13 && n.startsWith("234")) n = "+" + n;
  else if (n.length === 10 && /^[789]/.test(n)) n = "+234" + n;
  else return null;
  return /^\+[1-9][0-9]{7,14}$/.test(n) ? n : null;
}
export function validMilestone(value: string) {
  if (!value) return true;
  if (!/^\d{2}-\d{2}$/.test(value)) return false;
  const [month, day] = value.split("-").map(Number);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  );
}
export function validateMemberDraft(
  input: unknown,
  today = todayInLagos(),
): { ok: true; value: MemberDraft } | { ok: false; errors: FieldErrors } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, errors: { _form: "Enter the member details." } };
  const data = input as Record<string, unknown>,
    errors: FieldErrors = {};
  const text = (key: string, max: number, required = false) => {
    const v = typeof data[key] === "string" ? data[key].trim() : "";
    if (
      typeof data[key] !== "string" ||
      v.length > max ||
      /[\u0000-\u001f\u007f]/.test(v)
    )
      errors[key] = `Use text of at most ${max} characters.`;
    else if (required && !v) errors[key] = "This field is required.";
    return v;
  };
  const value: MemberDraft = {
    first: text("first", 120, true),
    last: text("last", 100, true),
    email: text("email", 254).toLowerCase(),
    phone: text("phone", 50),
    status: data.status as MemberStatus,
    occupation: text("occupation", 150),
    address: text("address", 600),
    birthday: text("birthday", 5),
    anniversary: text("anniversary", 5),
    joined: text("joined", 10, true),
  };
  if (
    typeof data.status !== "string" ||
    !Object.hasOwn(MEMBER_STATUSES, value.status)
  )
    errors.status = "Choose a membership status.";
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))
    errors.email = "Enter a valid email address.";
  const phone = normalizeMemberPhone(value.phone);
  if (phone === null)
    errors.phone =
      "Use a Nigerian number or include the international country code.";
  else value.phone = phone;
  if (!value.email && !value.phone && !errors.phone)
    errors.email =
      "Record at least one contact method: email or mobile number.";
  for (const key of ["birthday", "anniversary"] as const)
    if (!validMilestone(value[key]))
      errors[key] = "Choose a valid month and day. February 29 is allowed.";
  const d = new Date(value.joined + "T12:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value.joined) ||
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== value.joined ||
    value.joined < "1900-01-01" ||
    value.joined > today
  )
    errors.joined = "Choose a valid first visit date up to today.";
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value };
}
export function memberColumns(value: MemberDraft) {
  const milestone = (v: string) =>
    v ? v.split("-").map(Number) : [null, null];
  const [birthday_month, birthday_day] = milestone(value.birthday);
  const [anniversary_month, anniversary_day] = milestone(value.anniversary);
  return {
    other_names: value.first,
    surname: value.last,
    email: value.email || null,
    phone: value.phone || null,
    status: value.status,
    occupation: value.occupation || null,
    residential_address: value.address || null,
    joined_on: value.joined,
    birthday_month,
    birthday_day,
    anniversary_month,
    anniversary_day,
  };
}
