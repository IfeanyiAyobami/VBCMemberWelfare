"use client";
import Link from "next/link";
import {
  attendanceRate,
  type Cell,
  type Meeting,
  type Membership,
  type WorkspaceData,
} from "@/lib/home-cell/model";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso + "T12:00:00Z"));
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    new Date(iso + "T12:00:00Z"),
  );
const naira = (n: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);
const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h)) return "";
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};
const person = (m: Membership) =>
  m.care_members ? `${m.care_members.other_names} ${m.care_members.surname}` : "Member";
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const waNumber = (phone: string) => {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0") && d.length === 11) d = "234" + d.slice(1);
  return d;
};

export type MemberSignal = {
  lastCame: string | null;
  missedLastTwo: boolean;
};

/** Per-member attendance signals from recent meetings (latest first). */
export function memberSignals(
  history: WorkspaceData | null,
  cellId: string,
  members: Membership[],
) {
  const out = new Map<string, MemberSignal>();
  if (!history) return { signals: out, recorded: 0 };
  const meetings = history.meetings
    .filter((m) => m.cell_id === cellId)
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
  const recorded = meetings.filter((m) =>
    history.attendance.some((a) => a.meeting_id === m.id && a.member_id),
  );
  for (const mem of members) {
    const rows = recorded.map((m) => ({
      date: m.meeting_date,
      status:
        history.attendance.find((a) => a.meeting_id === m.id && a.member_id === mem.member_id)
          ?.status || "absent",
    }));
    const came = rows.find((r) => r.status !== "absent");
    out.set(mem.member_id, {
      lastCame: came ? came.date : null,
      missedLastTwo:
        rows.length >= 2 && rows[0].status === "absent" && rows[1].status === "absent",
    });
  }
  return { signals: out, recorded: recorded.length };
}

type Step = { key: string; label: string; state: "done" | "current" | "todo" | "skipped" };

export default function LeaderWeek({
  cell,
  history,
  members,
  today,
  link,
}: {
  cell: Cell;
  history: WorkspaceData | null;
  members: Membership[];
  today: string;
  link: (section: "attendance" | "visitors" | "finances" | "reports" | "members", meeting?: string) => string;
}) {
  const weekStart = addDays(today, -((weekdayOf(today) + 6) % 7));
  const weekEnd = addDays(weekStart, 6);
  const expected = addDays(weekStart, (cell.meeting_day + 6) % 7);
  const cellMembers = members.filter((m) => m.cell_id === cell.id);
  const meetings = (history?.meetings || [])
    .filter((m) => m.cell_id === cell.id)
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
  const meeting: Meeting | undefined = meetings.find(
    (m) => m.meeting_date >= weekStart && m.meeting_date <= weekEnd,
  );
  const rows = meeting
    ? (history?.attendance || []).filter((a) => a.meeting_id === meeting.id && a.member_id)
    : [];
  const visits = meeting ? (history?.visits || []).filter((v) => v.meeting_id === meeting.id) : [];
  const money = meeting
    ? (history?.finances || []).filter((f) => f.meeting_id === meeting.id && !f.voided_at)
    : [];
  const sent = !!meeting && ["submitted", "approved"].includes(meeting.status);
  const returned = meeting?.status === "correction_requested";
  const correction = meeting
    ? (history?.corrections || [])
        .filter((c) => c.meeting_id === meeting.id)
        .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0]
    : undefined;
  const opened = !!meeting,
    attended = rows.length > 0,
    offered = money.length > 0;

  const raw: Omit<Step, "state">[] = [
    { key: "opened", label: "Opened" },
    { key: "attendance", label: "Attendance" },
    { key: "visitors", label: "Visitors" },
    { key: "offering", label: "Offering" },
    { key: "report", label: "Report" },
  ];
  const doneMap: Record<string, boolean> = {
    opened,
    attendance: attended,
    visitors: visits.length > 0,
    offering: offered,
    report: sent,
  };
  let currentSet = false;
  const steps: Step[] = raw.map((s) => {
    if (doneMap[s.key]) return { ...s, state: "done" };
    if (s.key === "visitors" && (offered || sent)) return { ...s, state: "skipped" };
    if (s.key === "visitors" && attended && !currentSet) {
      currentSet = true;
      return { ...s, state: "current" };
    }
    if (!currentSet) {
      currentSet = true;
      return { ...s, state: "current" };
    }
    return { ...s, state: "todo" };
  });
  const doneCount = steps.filter((s) => s.state === "done" || s.state === "skipped").length;
  const present = rows.filter((r) => r.status !== "absent").length,
    absent = rows.filter((r) => r.status === "absent").length;

  let message: string;
  let primary: { label: string; href: string } | null = null;
  let secondary: { label: string; href: string } | null = null;
  if (!meeting) {
    message =
      today < expected
        ? `Your cell meets on ${WEEKDAYS[cell.meeting_day]}. Open the meeting on the day to take attendance.`
        : "This week's meeting hasn't been opened yet.";
    primary = today >= expected ? { label: "Open this week's meeting", href: link("attendance") } : null;
  } else if (returned) {
    message = "Your Coordinator returned this report. Make the change, then send it again.";
    primary = { label: "Fix and resend", href: link("reports", meeting.id) };
  } else if (meeting.status === "submitted") {
    message = "Report sent. Waiting for your Coordinator to approve it.";
    secondary = { label: "View report", href: link("reports", meeting.id) };
  } else if (meeting.status === "approved") {
    message = "Report approved. Thank you for leading this week.";
    secondary = { label: "View report", href: link("reports", meeting.id) };
  } else if (!attended) {
    message = "Meeting opened. Next, mark who came.";
    primary = { label: "Take attendance", href: link("attendance", meeting.id) };
  } else if (!offered) {
    message = `Attendance saved: ${present} present, ${absent} absent. Next, add anyone who visited, then the offering.`;
    primary = visits.length
      ? { label: "Record offering", href: link("finances", meeting.id) }
      : { label: "Add visitors", href: link("visitors", meeting.id) };
    secondary = visits.length
      ? null
      : { label: "No visitors — record offering", href: link("finances", meeting.id) };
  } else {
    message = `Attendance, ${visits.length ? "visitors " : ""}and offering are in. Send this week's report.`;
    primary = { label: "Send report", href: link("reports", meeting.id) };
  }

  const { signals, recorded } = memberSignals(history, cell.id, cellMembers);
  const checkOn = cellMembers.filter((m) => signals.get(m.member_id)?.missedLastTwo);
  const lastFour = meetings
    .filter((m) => (history?.attendance || []).some((a) => a.meeting_id === m.id && a.member_id))
    .slice(0, 4)
    .map((m) => m.id);
  const rate = attendanceRate(
    (history?.attendance || []).filter((a) => lastFour.includes(a.meeting_id) && a.member_id),
  );
  const month = today.slice(0, 7);
  const monthIds = new Set(meetings.filter((m) => m.meeting_date.startsWith(month)).map((m) => m.id));
  const offering = (history?.finances || [])
    .filter((f) => monthIds.has(f.meeting_id) && f.kind === "offering" && !f.voided_at)
    .reduce((n, f) => n + Number(f.amount), 0);
  const monthName = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short" }).format(
    new Date(today + "T12:00:00Z"),
  );

  return (
    <div className="hcw">
      <section
        className={"hc-panel hcw-meeting" + (returned ? " is-returned" : "")}
        aria-labelledby="hcw-meeting-h"
      >
        <div className="hcw-meeting-head">
          <div>
            <small className="hcw-label">THIS WEEK&rsquo;S MEETING</small>
            <h2 id="hcw-meeting-h">{longDate(meeting?.meeting_date || expected)}</h2>
            <span className="hcw-muted">
              {cell.name}
              {cell.meeting_start ? " · " + time12(cell.meeting_start) : ""}
            </span>
          </div>
          <span className={"hcw-chip " + (sent ? "ok" : returned ? "bad" : "wait")}>
            {meeting?.status === "approved"
              ? "Approved"
              : meeting?.status === "submitted"
                ? "Sent"
                : returned
                  ? "Returned"
                  : `${doneCount} of 5 done`}
          </span>
        </div>
        {returned && correction?.reason && (
          <p className="hcw-returned" role="alert">
            <strong>Returned by your Coordinator:</strong> &ldquo;{correction.reason}&rdquo;
          </p>
        )}
        <ol className="hcw-steps" aria-label="Weekly steps">
          {steps.map((s, i) => (
            <li key={s.key} className={"is-" + s.state} aria-current={s.state === "current" ? "step" : undefined}>
              <span aria-hidden="true">{s.state === "done" ? "✓" : s.state === "skipped" ? "–" : i + 1}</span>
              <small>
                {s.label}
                <span className="sr-only">
                  {s.state === "done" ? " done" : s.state === "skipped" ? " none" : s.state === "current" ? " next" : " to do"}
                </span>
              </small>
            </li>
          ))}
        </ol>
        <p className="hcw-message">{message}</p>
        {(primary || secondary) && (
          <div className="hcw-actions">
            {primary && (
              <Link className="hc-mobile-primary hcw-primary" href={primary.href}>
                {primary.label} →
              </Link>
            )}
            {secondary && (
              <Link className="hcw-secondary" href={secondary.href}>
                {secondary.label}
              </Link>
            )}
          </div>
        )}
      </section>

      <section className="hc-panel hcw-check" aria-labelledby="hcw-check-h">
        <div className="hcw-check-head">
          <h2 id="hcw-check-h">Check on</h2>
          <span className="hcw-muted">Missed the last 2 meetings</span>
        </div>
        {!history ? (
          <p className="hcw-muted hcw-pad">Loading recent meetings…</p>
        ) : recorded < 2 ? (
          <p className="hcw-muted hcw-pad">
            This list appears after attendance has been taken at two meetings.
          </p>
        ) : !checkOn.length ? (
          <p className="hcw-muted hcw-pad">Everyone came to at least one of the last two meetings.</p>
        ) : (
          checkOn.map((m) => {
            const name = person(m),
              phone = m.care_members?.phone || "",
              last = signals.get(m.member_id)?.lastCame;
            return (
              <div className="hcw-person" key={m.id}>
                <span className="hcw-avatar" aria-hidden="true">
                  {initials(name)}
                </span>
                <span className="hcw-person-text">
                  <strong>{name}</strong>
                  <small>{last ? "Last came " + shortDate(last) : "No attendance recorded yet"}</small>
                </span>
                {phone && (
                  <>
                    <a className="hcw-icon" href={"tel:" + phone} aria-label={"Call " + name}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
                      </svg>
                    </a>
                    <a
                      className="hcw-icon hcw-wa"
                      href={"https://wa.me/" + waNumber(phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={"WhatsApp " + name}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.2 3.1Z" />
                      </svg>
                    </a>
                  </>
                )}
              </div>
            );
          })
        )}
      </section>

      <div className="hcw-stats">
        <Link href={link("members")}>
          <small>Members</small>
          <strong>{cellMembers.length}</strong>
        </Link>
        <div>
          <small>Attendance</small>
          <strong>{rate === null ? "—" : rate + "%"}</strong>
        </div>
        <div>
          <small>Offering · {monthName}</small>
          <strong>{naira(offering)}</strong>
        </div>
      </div>
      <Link className="hcw-more" href={link("reports")}>
        Earlier weeks and reports →
      </Link>
    </div>
  );
}
