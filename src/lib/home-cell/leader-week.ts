/* v4.12 — helpers for the simple Cell Leader / Area Leader app.
 * Pure functions only, so they can be unit-tested without a browser. */
import type {
  Attendance,
  Cell,
  Finance,
  Meeting,
  Membership,
  RoleHolder,
  Visit,
  WorkspaceData,
} from "./model";

const TZ = "Africa/Lagos";
export const todayIso = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekday = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();
/** Monday of the ISO week, matching the database's one-meeting-per-week rule. */
export const weekStart = (iso: string) => addDays(iso, -((weekday(iso) + 6) % 7));
export const sameWeek = (a: string, b: string) => weekStart(a) === weekStart(b);
/** The most recent meeting day on or before today (0 = Sunday). */
export function lastMeetingDate(cell: Pick<Cell, "meeting_day">, today = todayIso()) {
  let d = today;
  for (let i = 0; i < 7 && weekday(d) !== cell.meeting_day; i++) d = addDays(d, -1);
  return d;
}
export const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(iso + "T12:00:00Z"));
export const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    new Date(iso + "T12:00:00Z"),
  );
function clock(t: string) {
  const [h, m] = (t || "00:00").split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return { text: m ? `${h12}:${String(m).padStart(2, "0")}` : String(h12), ampm };
}
/** "6–7 pm", "11 am–1 pm". */
export function timeRange(start: string, end: string) {
  const a = clock(start),
    b = clock(end);
  return a.ampm === b.ampm ? `${a.text}–${b.text} ${b.ampm}` : `${a.text} ${a.ampm}–${b.text} ${b.ampm}`;
}
export const naira = (n: number) =>
  "₦" +
  new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);

export const personName = (m: Membership) =>
  m.care_members ? `${m.care_members.other_names} ${m.care_members.surname}`.trim() : "Member";
export const visitName = (v: Visit) => {
  const p = v.care_members || v.care_guest_submissions;
  return p ? `${p.other_names} ${p.surname}`.trim() : "Visitor";
};
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export type WeekView = {
  cell: Cell;
  date: string;
  meeting: Meeting | null;
  attendance: Attendance[];
  visits: Visit[];
  money: Record<"offering" | "dues" | "expense", Finance[]>;
  correction: string | null;
};
export function weekView(data: WorkspaceData, cell: Cell, date: string): WeekView {
  const meeting =
    data.meetings.find((m) => m.cell_id === cell.id && sameWeek(m.meeting_date, date)) || null;
  const fin = meeting ? data.finances.filter((f) => f.meeting_id === meeting.id && !f.voided_at) : [];
  const correction = meeting
    ? data.corrections
        .filter((c) => c.meeting_id === meeting.id && c.status === "open")
        .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0]?.reason || null
    : null;
  return {
    cell,
    date: meeting?.meeting_date || date,
    meeting,
    attendance: meeting ? data.attendance.filter((a) => a.meeting_id === meeting.id) : [],
    visits: meeting ? data.visits.filter((v) => v.meeting_id === meeting.id) : [],
    money: {
      offering: fin.filter((f) => f.kind === "offering"),
      dues: fin.filter((f) => f.kind === "dues"),
      expense: fin.filter((f) => f.kind === "expense"),
    },
    correction,
  };
}
export const total = (rows: Finance[]) => rows.reduce((s, f) => s + Number(f.amount || 0), 0);
export const came = (rows: Attendance[]) => rows.filter((r) => r.status !== "absent").length;
export const absent = (rows: Attendance[]) => rows.filter((r) => r.status === "absent").length;
export const editable = (m: Meeting | null) => !m || m.status === "draft" || m.status === "correction_requested";
export const finished = (m: Meeting | null) =>
  !!m && ["submitted", "approved", "no_meeting"].includes(m.status);

/** Members marked absent (or missing) at each of the cell's last two recorded meetings. */
export function missedTwo(data: WorkspaceData, cellId: string) {
  const recorded = data.meetings
    .filter((m) => m.cell_id === cellId && m.status !== "no_meeting")
    .filter((m) => data.attendance.some((a) => a.meeting_id === m.id))
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))
    .slice(0, 2);
  if (recorded.length < 2) return { ready: false, people: [] as { m: Membership; last: string | null }[] };
  const people = data.memberships
    .filter((ms) => ms.cell_id === cellId)
    .filter((ms) =>
      recorded.every(
        (m) =>
          !data.attendance.some(
            (a) => a.meeting_id === m.id && a.member_id === ms.member_id && a.status !== "absent",
          ),
      ),
    )
    .map((ms) => ({ m: ms, last: lastCame(data, ms.member_id, cellId) }));
  return { ready: true, people };
}
export function lastCame(data: WorkspaceData, memberId: string, cellId: string) {
  const ids = new Set(data.meetings.filter((m) => m.cell_id === cellId).map((m) => m.id));
  const dates = data.attendance
    .filter((a) => a.member_id === memberId && a.status !== "absent" && ids.has(a.meeting_id))
    .map((a) => data.meetings.find((m) => m.id === a.meeting_id)?.meeting_date || "")
    .filter(Boolean)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

export type AreaStatus = { key: "wait" | "ok" | "none" | "warn"; label: string };
export function areaStatus(data: WorkspaceData, w: WeekView): AreaStatus {
  const m = w.meeting;
  if (!m || m.status === "draft") return { key: "warn", label: "Not sent yet" };
  if (m.status === "correction_requested") return { key: "warn", label: "Sent back" };
  if (m.status === "approved") return { key: "ok", label: "Approved" };
  if (m.status === "no_meeting") return { key: "none", label: "No meeting" };
  if (data.approvable?.includes(m.id) || data.reviewable?.includes(m.id))
    return { key: "wait", label: "Waiting for you" };
  return { key: "none", label: "Waiting for approval" };
}
export const holders = (data: WorkspaceData, role: string, pred: (r: RoleHolder) => boolean) =>
  (data.roles || []).filter((r) => r.role === role && pred(r));
/** First Nigerian-style phone number in a free-text field. */
export function findPhone(text: string | null | undefined) {
  const m = /(\+?234|0)[\s-]?[789][01]\d(?:[\s-]?\d){7}/.exec(text || "");
  return m ? m[0].replace(/[\s-]/g, "") : "";
}
export const waLink = (phone: string) => {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0") && d.length === 11) d = "234" + d.slice(1);
  return "https://wa.me/" + d;
};
export function plainError(message: string) {
  const map: Record<string, string> = {
    HCO_STALE_REPORT_REFRESH_FIRST: "This report changed on another phone. We've refreshed it, so please try again.",
    HCO_RECORD_ATTENDANCE_FIRST: "Take attendance before sending.",
    HCO_EXISTING_CONTACT_SEARCH_AND_CONFIRM_IDENTITY: "This phone number is already in church records. Choose the person below.",
    HCO_SUBMITTED_REPORT_IS_LOCKED: "This report has already been sent.",
    HCO_CANNOT_REVIEW_OWN_CELL_REPORT: "You can't approve or send back your own cell's report.",
    HCO_AREA_LEADER_APPROVAL_REQUIRED: "Only the Area Leader can approve this report.",
    HCO_INVALID_MEETING_DATE: "That date can't be used for this cell.",
    HCO_MEETING_ALREADY_HAS_RECORDS: "This week already has records, so it can't be marked No meeting.",
    HCO_INVALID_TRANSACTION: "Check the amount and what it was for.",
    HCO_CORRECTION_REASON_REQUIRED: "Write a few words about what to fix.",
    HCO_VOID_REASON_REQUIRED: "Write a few words about why you're removing it.",
    HCO_VISITOR_ALREADY_RECORDED_FOR_MEETING: "This visitor is already added for this meeting.",
    HCO_USE_EXISTING_MEETING_FOR_THIS_WEEK: "This week already has a meeting on another day.",
  };
  const code = Object.keys(map).find((k) => message.includes(k));
  return code ? map[code] : message || "Something went wrong. Please try again.";
}

/** Cell Leaders and Area Leaders (either or both) get the simple leader app. */
export function isLeaderOnly(assignments: { role: string }[], churchAdmin: boolean) {
  return (
    !churchAdmin &&
    assignments.length > 0 &&
    assignments.every((a) => a.role === "cell_leader" || a.role === "area_leader")
  );
}
