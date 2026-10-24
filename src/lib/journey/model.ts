export type JourneyPerson = {
  member_id: string;
  version: number;
  name: string;
  status: string;
  assigned_to: string | null;
  worker_name: string | null;
  intention: string;
  official_joined_on: string | null;
  care_until: string | null;
  care_status: string;
  legacy_member: boolean;
  assignment_conflict: boolean;
  membership_review: boolean;
  service_count: number;
  contact_count: number;
  registered_at: string;
  reported_first_visit: string | null;
  next_due: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  contact_consent: boolean;
  email_opt_in: boolean;
  sms_opt_in: boolean;
};
export type Entry = {
  id: string;
  method?: string;
  outcome?: string;
  note?: string;
  evidence?: string;
  occurred_at?: string;
  created_at?: string;
  service_date?: string;
  service_key?: string;
  service_type?: string;
  source?: string;
  verification?: string;
  qualifies?: boolean;
  voided_at?: string;
  kind?: string;
  due_at?: string;
  week?: number;
  attended_on?: string;
  action?: string;
  actor_name?: string;
  detail?: Record<string, unknown>;
};
export type JourneyDetail = {
  person: JourneyPerson;
  attendance: Entry[];
  contacts: Entry[];
  tasks: Entry[];
  events: Entry[];
  guests: {
    id: string;
    visit_date: string;
    source: string;
    review_status: string;
  }[];
  legacy_contacts: Entry[];
  cfc: null | {
    cohort_id: string;
    completed_on: string | null;
    certificate_number: string | null;
  };
  cfc_attendance: Entry[];
};
export type JourneySnapshot = {
  items: JourneyPerson[];
  total: number;
  stats: Record<string, number>;
  detail: JourneyDetail | null;
  capabilities: {
    coordinator: boolean;
    foundation: boolean;
    administrator: boolean;
    friend: boolean;
  };
  policy: {
    service_types: string[];
    first_contact_hours: number;
    cfc_policy: string | null;
    care_policy: string | null;
  };
  team: { id: string; name: string; role: string; capabilities: string[] }[];
  cohorts: { id: string; name: string; starts_on: string }[];
};
export const outcomes = {
  positive: "Successful · positive",
  undecided: "Successful · undecided",
  no_answer: "No answer",
  unreachable: "Unreachable",
  promised_return: "Promised to return",
  callback: "Requested a callback",
  not_interested: "Not interested",
  no_further_contact: "Requested no further contact",
};
export const actions = [
  "assign",
  "contact",
  "attendance",
  "void_attendance",
  "review_membership",
  "intention",
  "join",
  "legacy_date",
  "care_review",
  "enrol",
  "class_attendance",
  "complete_cfc",
  "certificate",
  "cohort",
  "policy",
  "role",
] as const;
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function nextMembershipSunday(today = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(today);
  const part = (name: string) =>
    Number(parts.find((p) => p.type === name)?.value);
  const year = part("year"),
    month = part("month") - 1,
    day = part("day");
  const last = (y: number, m: number) => {
    const d = new Date(Date.UTC(y, m + 1, 0));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d;
  };
  let d = last(year, month);
  if (d.getUTCDate() < day) d = last(year, month + 1);
  return d.toISOString().slice(0, 10);
}
