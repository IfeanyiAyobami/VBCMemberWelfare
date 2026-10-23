"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  sections,
  titles,
  money,
  attendanceRate,
  type Section,
  type WorkspaceData,
  type Meeting,
  type Person,
  type Cell,
} from "@/lib/home-cell/model";
import { useFormDrafts } from "./useFormDrafts";
import { displayDate, parseDisplayDate } from "@/lib/home-cell/dates";
import AuditHistory from "./AuditHistory";
import MemberOnboarding from "./MemberOnboarding";
import MemberTransfers from "./MemberTransfers";
import LeaderContacts from "./LeaderContacts";
import LeadershipAccounts from "./LeadershipAccounts";
import "./workspace.css";
import "../../app/home-cell/leaders/hco.css";
const icons: Record<Section, string> = {
  overview: "home",
  areas: "map",
  cells: "house",
  members: "people",
  attendance: "calendar",
  finances: "wallet",
  visitors: "person",
  reports: "chart",
  communications: "send",
  leaders: "team",
  settings: "settings",
};
function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7v11H3Z" />
        <path d="M9 21v-8h6v8" />
      </>
    ),
    house: (
      <>
        <path d="m2 10 10-8 10 8M5 8v13h14V8M9 21v-8h6v8" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-5a6 6 0 0 1 12 0v5M16 4a3 3 0 0 1 0 6M21 21v-5a5 5 0 0 0-4-5" />
      </>
    ),
    person: (
      <>
        <circle cx="10" cy="6" r="3" />
        <path d="M3 21v-5a7 7 0 0 1 14 0v5M20 6v6M17 9h6" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 2v6M17 2v6M3 11h18m-14 5 3 3 6-6" />
      </>
    ),
    wallet: (
      <>
        <rect x="3" y="6" width="18" height="15" rx="2" />
        <path d="m3 7 14-5v4m4 7h-6v5h6" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h19M7 17v-5M12 17V8M17 17V4" />
      </>
    ),
    send: (
      <>
        <path d="m2 3 20 9-20 9 4-9Zm4 9h16" />
      </>
    ),
    map: (
      <>
        <path d="m3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3Zm6-3v17m6-14v17" />
      </>
    ),
    team: (
      <>
        <circle cx="12" cy="6" r="3" />
        <path d="M6 21v-5a6 6 0 0 1 12 0v5M3 10v7M21 10v7M1 13h4M19 13h4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
      </>
    ),
  };
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.home}
    </svg>
  );
}
function Panel({
  title,
  children,
  action,
  className = "",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={"hc-panel " + className}>
      <header>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
function Empty({
  children = "No records in this date range.",
}: {
  children?: ReactNode;
}) {
  return <div className="hc-empty">{children}</div>;
}
function Badge({ value }: { value: string }) {
  return (
    <span className={"hc-badge " + value}>{value.replaceAll("_", " ")}</span>
  );
}
function Stats({
  items,
}: {
  items: { label: string; value: ReactNode; note: string; icon: string }[];
}) {
  return (
    <div className="hc-stats">
      {items.map((x, i) => (
        <article key={x.label}>
          <span className={"hc-stat-icon tone-" + i}>
            <Icon name={x.icon} />
          </span>
          <div>
            <span>{x.label}</span>
            <strong>{x.value}</strong>
            <small>{x.note}</small>
          </div>
        </article>
      ))}
    </div>
  );
}
function DataTable({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="hc-table-wrap">
      <table style={head.length <= 3 ? { minWidth: "100%" } : undefined}>
        <thead>
          <tr>
            {head.map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export default function HomeCellWorkspace({ section }: { section: Section }) {
  const formDrafts = useFormDrafts();
  const [data, setData] = useState<WorkspaceData | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [menu, setMenu] = useState(false),
    [dark, setDark] = useState(true),
    [scope, setScope] = useState(""),
    [area, setArea] = useState(""),
    [cellId, setCellId] = useState(""),
    [meetingId, setMeetingId] = useState(""),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(() => today().slice(0, 8) + "01"),
    [to, setTo] = useState(today),
    [fromInput, setFromInput] = useState(() =>
      displayDate(today().slice(0, 8) + "01"),
    ),
    [toInput, setToInput] = useState(() => displayDate(today())),
    [people, setPeople] = useState<{
      members: Person[];
      guests: Person[];
    } | null>(null),
    [chosen, setChosen] = useState<{ kind: string; person: Person } | null>(
      null,
    );
  const generation = useRef(0),
    requestId = useRef("");
  const load = useCallback(async () => {
    const n = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({
        from,
        to,
        ...(scope ? { scope } : {}),
        ...(area ? { area } : {}),
        ...(cellId ? { cell: cellId } : {}),
      });
      const r = await fetch("/api/home-cell/workspace?" + q, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.message);
      if (n === generation.current) setData(j);
    } catch (e) {
      if (n === generation.current)
        setError(e instanceof Error ? e.message : "Unable to load workspace");
    } finally {
      if (n === generation.current) setLoading(false);
    }
  }, [scope, from, to, area, cellId]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("scope")) setScope(p.get("scope")!);
    if (p.get("area")) setArea(p.get("area")!);
    if (p.get("cell")) setCellId(p.get("cell")!);
    if (p.get("meeting")) setMeetingId(p.get("meeting")!);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    try {
      setDark(localStorage.getItem("hco-reference-theme") !== "light");
    } catch {}
  }, []);
  const write = async (payload: Record<string, unknown>) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(
        "/api/home-cell/workspace?" +
          new URLSearchParams(scope ? { scope } : {}),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const j = await r.json();
      if (!r.ok) throw Error(j.message);
      if (payload.action === "meeting" && j.result?.id) {
        setMeetingId(j.result.id);
        const date = j.result.meeting_date as string;
        if (date < from) {
          setFrom(date);
          setFromInput(displayDate(date));
        }
        if (date > to) {
          setTo(date);
          setToInput(displayDate(date));
        }
      }
      const draftKeys: Record<string, string> = {
        attendance: "attendance:" + payload.meeting_id,
        finance: "finance:" + payload.meeting_id,
        cell: "cell:" + (payload.cell_id || "new"),
        visitor: "visitor",
        announcement: "announcement",
        followup: "followup:" + payload.visit_id,
        correction: "correction:" + payload.meeting_id,
      };
      if (draftKeys[String(payload.action)])
        formDrafts.clear(draftKeys[String(payload.action)]);
      setNotice("Saved successfully.");
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const submit =
    (action: string, extras: Record<string, unknown> = {}) =>
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const f = e.currentTarget;
      const values = Object.fromEntries(new FormData(f));
      const ok = await write({ ...values, ...extras, action });
      if (ok && ["announcement", "finance", "cell"].includes(action)) f.reset();
    };
  const findPeople = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const r = await fetch(
        "/api/home-cell/people?" +
          new URLSearchParams({ q: search, ...(scope ? { scope } : {}) }),
      );
      const j = await r.json();
      if (!r.ok) throw Error(j.message);
      setPeople(j);
      setChosen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search unavailable");
    }
  };
  const cells = (data?.cells || []).filter((c) => !area || c.area_id === area);
  const activeCell =
    cellId && cells.some((c) => c.id === cellId)
      ? cellId
      : cells.length === 1
        ? cells[0].id
        : "";
  const scopedCells = cells.filter((c) => !activeCell || c.id === activeCell),
    ids = new Set(scopedCells.map((c) => c.id));
  const meetings = (data?.meetings || []).filter((m) => ids.has(m.cell_id));
  const selectedMeeting =
    meetings.find((m) => m.id === meetingId) ||
    meetings.find((m) => m.cell_id === activeCell);
  const meetingIds = new Set(meetings.map((m) => m.id));
  const members = (data?.memberships || []).filter((m) => ids.has(m.cell_id));
  const attendance = (data?.attendance || []).filter((a) =>
    meetingIds.has(a.meeting_id),
  );
  const finances = (data?.finances || []).filter((f) =>
    meetingIds.has(f.meeting_id),
  );
  const visits = (data?.visits || []).filter((v) => ids.has(v.cell_id));
  const total = (kind: string) =>
    finances
      .filter((f) => f.kind === kind && !f.voided_at)
      .reduce((n, f) => n + Number(f.amount), 0);
  const cellName = (id: string) =>
    data?.cells.find((c) => c.id === id)?.name || "Unknown cell";
  const areaName = (id: string) =>
    data?.areas.find((c) => c.id === id)?.name || "Area";
  const labelRole = (role: string) =>
    role.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const canWrite =
    !!data &&
    (data.churchAdmin ||
      data.assignments.some(
        (a) =>
          a.role === "cell_leader" &&
          (!(activeCell || selectedMeeting?.cell_id) ||
            a.cell_id === (activeCell || selectedMeeting?.cell_id)),
      ));
  const roleName = data?.churchAdmin
    ? "Church Administrator"
    : data?.assignments.some((a) => a.role === "coordinator")
      ? "Coordinator"
      : data?.assignments.some((a) => a.role === "area_leader")
        ? "Area Leader"
        : "Cell Leader";
  const nav = sections.filter(
    (x) =>
      x !== "leaders" ||
      data?.churchAdmin ||
      data?.assignments.some((a) => a.role === "coordinator"),
  );
  const name = (p: Person | null) =>
    p ? `${p.other_names} ${p.surname}` : "Visitor";
  const meetingSelect = (
    <label>
      Select an existing fellowship
      <select
        value={selectedMeeting?.id || ""}
        onChange={(e) => setMeetingId(e.target.value)}
      >
        <option value="">Choose a dated home-cell fellowship</option>
        {meetings.map((m) => (
          <option key={m.id} value={m.id}>
            {m.meeting_date} · {cellName(m.cell_id)} ·{" "}
            {m.status.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
  const peopleSearch = (
    <>
      <form className="hc-search-form" onSubmit={findPeople}>
        <input
          aria-label="Search existing records"
          placeholder="Name, phone number or email (3+ characters)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          minLength={3}
          required
        />
        <button>Search records</button>
      </form>
      {people && (
        <div className="hc-search-results">
          {people.members.length + people.guests.length === 0 ? (
            <Empty>No matching records. You may register a new visitor.</Empty>
          ) : (
            [
              ...people.members.map((person) => ({ person, kind: "member" })),
              ...people.guests.map((person) => ({ person, kind: "guest" })),
            ].map(({ person, kind }) => (
              <article key={kind + person.id}>
                <div>
                  <b>{name(person)}</b>
                  <small>
                    {kind} · {person.phone} · {person.email}
                  </small>
                </div>
                <button
                  className="hc-secondary"
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Confirm this is the same person before linking their visit or membership.",
                      )
                    )
                      setChosen({ kind, person });
                  }}
                >
                  Confirm identity
                </button>
              </article>
            ))
          )}
        </div>
      )}
      {chosen && (
        <p className="hc-feedback">
          Selected: {name(chosen.person)} ({chosen.kind}){" "}
          <button
            type="button"
            className="hc-link-button"
            onClick={() => setChosen(null)}
          >
            Clear
          </button>
        </p>
      )}
    </>
  );
  const meetingForm = (
    <Panel title="Start fellowship">
      <form
        data-draft-key={"meeting:" + activeCell}
        className="hc-form-row"
        onSubmit={submit("meeting")}
      >
        <label>
          Home cell
          <select
            name="cell_id"
            required
            defaultValue={activeCell}
            key={activeCell}
          >
            <option value="">Select home cell</option>
            {scopedCells.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Meeting date
          <input
            name="meeting_date"
            type="date"
            defaultValue={today()}
            max={today()}
            required
          />
        </label>
        <button disabled={busy}>Start / open fellowship</button>
      </form>
    </Panel>
  );
  const reportsTable = (
    <DataTable
      head={[
        "Meeting",
        "Home cell",
        "Attendance",
        "Offering",
        "Report status",
        "Action",
      ]}
    >
      {meetings.map((m) => (
        <tr key={m.id}>
          <td>{m.meeting_date}</td>
          <td>{cellName(m.cell_id)}</td>
          <td>
            {
              (data?.attendance || []).filter(
                (a) => a.meeting_id === m.id && a.status !== "absent",
              ).length
            }
          </td>
          <td>
            {money(
              (data?.finances || [])
                .filter(
                  (f) =>
                    f.meeting_id === m.id &&
                    f.kind === "offering" &&
                    !f.voided_at,
                )
                .reduce((n, f) => n + Number(f.amount), 0),
            )}
          </td>
          <td>
            <Badge value={m.status} />
          </td>
          <td>
            <Link
              className="hc-link-button"
              href={href("reports", { meeting: m.id })}
            >
              Review
            </Link>
          </td>
        </tr>
      ))}
    </DataTable>
  );
  return (
    <div className={"hc-app" + (dark ? " hc-dark" : "")}>
      <a href="#hc-content" className="hc-skip">
        Skip to content
      </a>
      {menu && (
        <button
          className="hc-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={"hc-sidebar" + (menu ? " open" : "")}>
        <Link className="hc-brand" href="/home-cell">
          <img src="/assets/image-7d4e31b34082.png" alt="Vine Branch Church" />
          <span>
            VINE BRANCH CHURCH<small>HOME CELL OFFICE</small>
            <em>STRONGER CELLS. STRONGER CHURCH.</em>
          </span>
        </Link>
        <span className="hc-nav-label">CHURCH OFFICE</span>
        <nav aria-label="Home Cell Office">
          {nav.map((x) => (
            <Link
              key={x}
              href={href(x)}
              className={section === x ? "active" : ""}
              onClick={() => setMenu(false)}
              aria-current={section === x ? "page" : undefined}
            >
              <Icon name={icons[x]} />
              {titles[x]}
            </Link>
          ))}
        </nav>
        <div className="hc-sidebar-quote">
          <strong>
            Healthy Cells
            <br />
            Stronger Church
          </strong>
          <p>“…from house to house, and breaking bread from house to house…”</p>
          <small>ACTS 2:46</small>
        </div>
        <Link className="hc-care-link" href="/overview">
          ← Member Care
        </Link>
      </aside>
      <div className="hc-workspace">
        <header className="hc-topbar">
          <button
            className="hc-menu hc-icon-button"
            aria-expanded={menu}
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
          <img
            className="hc-mobile-logo"
            src="/assets/image-7d4e31b34082.png"
            alt="Vine Branch Church"
          />
          <span className="hc-top-title">
            <span className="hc-mobile-church">VINE BRANCH CHURCH</span>Home
            Cell Office
          </span>
          <select
            className="hc-workspace-select"
            aria-label="Leadership workspace"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setArea("");
              setCellId("");
              setMeetingId("");
            }}
          >
            <option value="">All my assignments</option>
            {data?.churchAdmin && (
              <option value="all">Church Administrator · Church-wide</option>
            )}
            {data?.assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {labelRole(a.role)} ·{" "}
                {a.cell_id
                  ? cellName(a.cell_id)
                  : a.area_id
                    ? areaName(a.area_id)
                    : "Church-wide"}
              </option>
            ))}
          </select>
          <button
            className="hc-icon-button"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => {
              localStorage.setItem(
                "hco-reference-theme",
                dark ? "light" : "dark",
              );
              setDark(!dark);
            }}
          >
            {dark ? "☀" : "☾"}
          </button>
          <div className="hc-profile">
            <span>{data?.email?.slice(0, 2).toUpperCase() || "VB"}</span>
            <div>
              <b>{data?.email || "Leadership workspace"}</b>
              <small>{roleName}</small>
            </div>
          </div>
        </header>
        <main id="hc-content" className="hc-content">
          <div className="hc-breadcrumb">
            Home <span>›</span> Home Cell Office <span>›</span>{" "}
            {titles[section]}
          </div>
          <section className={"hc-hero hc-photo-" + section}>
            <div>
              <small>VINE BRANCH CHURCH · HOME CELL OFFICE</small>
              <h1>
                {section === "overview"
                  ? area
                    ? areaName(area)
                    : roleName === "Church Administrator"
                      ? "Home Cell Office"
                      : roleName + " Dashboard"
                  : section === "visitors"
                    ? "WELCOME OUR VISITORS"
                    : titles[section]}
              </h1>
              <p>
                {section === "visitors"
                  ? "Capture details, connect them to follow-up, and help them belong."
                  : "Fellowship, leadership and care — stronger together."}
              </p>
              <i />
            </div>
            <blockquote>
              “For where two or three are gathered together in my name, there am
              I in the midst of them.”<small>MATTHEW 18:20</small>
            </blockquote>
          </section>
          <div className="hc-filters">
            <label>
              Area
              <select
                value={area}
                onChange={(e) => {
                  setArea(e.target.value);
                  setCellId("");
                  setMeetingId("");
                }}
              >
                <option value="">All assigned areas</option>
                {data?.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Home cell
              <select
                value={activeCell}
                onChange={(e) => {
                  setCellId(e.target.value);
                  setMeetingId("");
                }}
              >
                <option value="">All assigned cells</option>
                {cells.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              From
              <input
                type="text"
                inputMode="numeric"
                placeholder="DD/MM/YYYY"
                aria-label="From date (DD/MM/YYYY)"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="text"
                inputMode="numeric"
                placeholder="DD/MM/YYYY"
                aria-label="To date (DD/MM/YYYY)"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
              />
            </label>
            <button
              className="hc-secondary"
              onClick={() => {
                const start = parseDisplayDate(fromInput),
                  end = parseDisplayDate(toInput);
                if (!start || !end || start > end) {
                  setError(
                    "Enter valid dates as DD/MM/YYYY, with From on or before To.",
                  );
                  return;
                }
                if (start === from && end === to) void load();
                else {
                  setFrom(start);
                  setTo(end);
                }
              }}
              disabled={loading}
            >
              Apply dates
            </button>
          </div>
          {error && (
            <div className="hc-alert" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="hc-feedback" role="status">
              {notice}
            </div>
          )}
          {loading && (
            <div className="hc-loading" role="status">
              Loading your workspace…
            </div>
          )}
          {data && (
            <fieldset
              className="hc-workflow-fields"
              ref={formDrafts.root}
              disabled={loading || busy}
              onChangeCapture={formDrafts.capture}
              aria-label={titles[section]}
              aria-busy={loading || busy}
            >
              {section === "overview" && (data.churchAdmin || data.assignments.some(a=>a.role === 'coordinator')) && <MemberTransfers onChanged={load} />}
              {section === "overview" && (
                <>
                  <Stats
                    items={[
                      {
                        label: "Home Cells",
                        value: scopedCells.length,
                        note: "Within your selected scope",
                        icon: "house",
                      },
                      {
                        label: "Registered Members",
                        value: new Set(members.map((m) => m.member_id)).size,
                        note: "Active cell memberships",
                        icon: "people",
                      },
                      {
                        label: "Attendance Rate",
                        value:
                          attendanceRate(attendance) === null
                            ? "—"
                            : attendanceRate(attendance) + "%",
                        note: "Recorded fellowship attendance",
                        icon: "calendar",
                      },
                      {
                        label: "Total Offerings",
                        value: money(total("offering")),
                        note: "Selected date range",
                        icon: "wallet",
                      },
                    ]}
                  />
                  <Panel title="Quick Actions">
                    <div className="hc-quick-actions">
                      {(
                        [
                          "cells",
                          "members",
                          "attendance",
                          "finances",
                          "reports",
                        ] as Section[]
                      ).map((x) => (
                        <Link key={x} href={href(x)}>
                          <Icon name={icons[x]} />
                          {x === "attendance" ? "Take Attendance" : titles[x]}
                        </Link>
                      ))}
                    </div>
                  </Panel>
                  <div className="hc-overview-grid">
                    <Panel title="Home Cell Attendance">
                      <p className="hc-muted">
                        Present and late as a proportion of recorded attendance
                      </p>
                      {scopedCells.slice(0, 8).map((c) => {
                        const mids = new Set(
                          meetings
                            .filter((m) => m.cell_id === c.id)
                            .map((m) => m.id),
                        );
                        const rate = attendanceRate(
                          attendance.filter((a) => mids.has(a.meeting_id)),
                        );
                        return (
                          <div className="hc-bar-row" key={c.id}>
                            <span>{c.name}</span>
                            <div className="hc-bar">
                              <span style={{ width: (rate || 0) + "%" }} />
                            </div>
                            <b>{rate === null ? "—" : rate + "%"}</b>
                          </div>
                        );
                      })}
                      {!attendance.length && (
                        <Empty>No fellowship attendance recorded yet.</Empty>
                      )}
                    </Panel>
                    <Panel title="Reporting Compliance">
                      <div className="hc-compliance">
                        <strong>
                          {meetings.length
                            ? Math.round(
                                (meetings.filter((m) =>
                                  ["submitted", "approved"].includes(m.status),
                                ).length /
                                  meetings.length) *
                                  100,
                              ) + "%"
                            : "—"}
                        </strong>
                        <span>Started meetings submitted or approved</span>
                      </div>
                      <div className="hc-status-grid">
                        {[
                          "draft",
                          "submitted",
                          "approved",
                          "correction_requested",
                        ].map((s) => (
                          <div key={s}>
                            <Badge value={s} />
                            <b>{meetetingsCount(s)}</b>
                          </div>
                        ))}
                      </div>
                      <p className="hc-muted">
                        Cells without a started meeting are shown separately in
                        Reports.
                      </p>
                    </Panel>
                    <Panel
                      title="Recent Visitors"
                      action={
                        <Link href="/home-cell/visitors">View all →</Link>
                      }
                    >
                      {visits.slice(0, 5).map((v) => (
                        <div className="hc-person-row" key={v.id}>
                          <span className="hc-avatar">
                            {name(v.care_members || v.care_guest_submissions)
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <div>
                            <b>
                              {name(v.care_members || v.care_guest_submissions)}
                            </b>
                            <small>
                              {cellName(v.cell_id)} ·{" "}
                              {v.visited_at.slice(0, 10)}
                            </small>
                          </div>
                          <Badge value={v.followup_status} />
                        </div>
                      ))}
                      {!visits.length && (
                        <Empty>No visitors recorded yet.</Empty>
                      )}
                    </Panel>
                  </div>
                  <div className="hc-two-col">
                    <Panel title="Recent Fellowship Meetings">
                      {meetings.length ? (
                        reportsTable
                      ) : (
                        <Empty>
                          Start a fellowship to record attendance and prepare
                          its weekly report.
                        </Empty>
                      )}
                    </Panel>
                    <Panel title="Financial Summary">
                      <div className="hc-finance-summary">
                        {["offering", "dues", "expense"].map((k) => (
                          <div key={k}>
                            <span>{labelRole(k)}</span>
                            <strong>{money(total(k))}</strong>
                          </div>
                        ))}
                        <div>
                          <span>Net movement (selected range)</span>
                          <strong>
                            {money(
                              total("offering") +
                                total("dues") -
                                total("expense"),
                            )}
                          </strong>
                        </div>
                      </div>
                    </Panel>
                  </div>
                </>
              )}
              {section === "areas" && (
                <Panel title="Your Assigned Areas">
                  <div className="hc-area-grid">
                    {data.areas.map((a) => (
                      <Link
                        key={a.id}
                        href={href("cells", { area: a.id, cell: "" })}
                      >
                        <div className="hc-area-banner">
                          <Icon name="map" />
                          <strong>{a.name}</strong>
                        </div>
                        <div>
                          <b>
                            {
                              data.cells.filter((c) => c.area_id === a.id)
                                .length
                            }
                          </b>{" "}
                          home cells <span>View home cells →</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </Panel>
              )}
              {section === "cells" && (
                <>
                  <LeaderContacts scope={scope} />
                  <Panel title="Home Cell Directory">
                    <DataTable
                      head={[
                        "Home cell",
                        "Area",
                        "Address",
                        "Fellowship",
                        "Members",
                        "Action",
                      ]}
                    >
                      {scopedCells.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <b>{c.name}</b>
                          </td>
                          <td>{areaName(c.area_id)}</td>
                          <td>{c.address || "Not provided"}</td>
                          <td>
                            {
                              [
                                "Sunday",
                                "Monday",
                                "Tuesday",
                                "Wednesday",
                                "Thursday",
                                "Friday",
                                "Saturday",
                              ][c.meeting_day]
                            }
                            <br />
                            {c.meeting_start.slice(0, 5)}–
                            {c.meeting_end.slice(0, 5)}
                          </td>
                          <td>
                            {members.filter((m) => m.cell_id === c.id).length}
                          </td>
                          <td>
                            <button
                              className="hc-secondary"
                              onClick={() => setCellId(c.id)}
                            >
                              Select cell
                            </button>
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  </Panel>
                  {data.manager && (
                    <Panel
                      title={activeCell ? "Edit Home Cell" : "Add Home Cell"}
                    >
                      <form
                        data-draft-key={"cell:" + (activeCell || "new")}
                        key={activeCell}
                        className="hc-form-grid"
                        onSubmit={submit(
                          "cell",
                          activeCell ? { cell_id: activeCell } : {},
                        )}
                      >
                        <label>
                          Area
                          <select
                            name="area_id"
                            required
                            defaultValue={
                              scopedCells.find((c) => c.id === activeCell)
                                ?.area_id || area
                            }
                          >
                            <option value="">Select area</option>
                            {data.areas.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Home cell name
                          <input
                            name="name"
                            required
                            maxLength={160}
                            defaultValue={
                              scopedCells.find((c) => c.id === activeCell)?.name
                            }
                          />
                        </label>
                        <label className="hc-full">
                          Address
                          <input
                            name="address"
                            maxLength={600}
                            defaultValue={
                              scopedCells.find((c) => c.id === activeCell)
                                ?.address || ""
                            }
                          />
                        </label>
                        {activeCell && (
                          <>
                            <label>
                              Meeting day
                              <select
                                name="meeting_day"
                                defaultValue={
                                  scopedCells.find((c) => c.id === activeCell)
                                    ?.meeting_day
                                }
                              >
                                {[
                                  "Sunday",
                                  "Monday",
                                  "Tuesday",
                                  "Wednesday",
                                  "Thursday",
                                  "Friday",
                                  "Saturday",
                                ].map((d, i) => (
                                  <option key={d} value={i}>
                                    {d}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Start
                              <input
                                name="meeting_start"
                                type="time"
                                required
                                defaultValue={
                                  scopedCells.find((c) => c.id === activeCell)
                                    ?.meeting_start
                                }
                              />
                            </label>
                            <label>
                              End
                              <input
                                name="meeting_end"
                                type="time"
                                required
                                defaultValue={
                                  scopedCells.find((c) => c.id === activeCell)
                                    ?.meeting_end
                                }
                              />
                            </label>
                          </>
                        )}
                        <button disabled={busy}>
                          {activeCell ? "Save changes" : "Add home cell"}
                        </button>
                      </form>
                    </Panel>
                  )}
                </>
              )}
              {section === "members" && (
                <>
                  <Panel title="Cell Members">
                    <DataTable
                      head={[
                        "Name",
                        "Home cell",
                        "Phone",
                        "Email",
                        "Member Care status",
                      ]}
                    >
                      {members.map((m) => (
                        <tr key={m.id}>
                          <td>{name(m.care_members)}</td>
                          <td>{cellName(m.cell_id)}</td>
                          <td>{m.care_members?.phone || "—"}</td>
                          <td>{m.care_members?.email || "—"}</td>
                          <td>
                            <Badge
                              value={m.care_members?.status || "visitor"}
                            />
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                    {!members.length && (
                      <Empty>No members assigned to these cells.</Empty>
                    )}
                  </Panel>
                  {(data.churchAdmin || data.assignments.some(a=>a.role === "cell_leader")) && <MemberOnboarding cells={scopedCells.filter(c=>data.churchAdmin || data.assignments.some(a=>a.role==='cell_leader'&&a.cell_id===c.id))} scope={scope} onSaved={load} />}
                  <MemberTransfers onChanged={load} />
                </>
              )}
              {section === "attendance" && (
                <>
                  {canWrite && meetingForm}
                  <Panel title="Fellowship Attendance">
                    {meetingSelect}
                    {selectedMeeting && (
                      <>
                        <p>
                          <Badge value={selectedMeeting.status} /> ·{" "}
                          {cellName(selectedMeeting.cell_id)} ·{" "}
                          {selectedMeeting.meeting_date}
                        </p>
                        {canWrite &&
                        ["draft", "correction_requested"].includes(
                          selectedMeeting.status,
                        ) ? (
                          <form
                            data-draft-key={"attendance:" + selectedMeeting.id}
                            key={selectedMeeting.id + selectedMeeting.version}
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              const rows = members
                                .filter(
                                  (m) => m.cell_id === selectedMeeting.cell_id,
                                )
                                .map((m) => ({
                                  member_id: m.member_id,
                                  status: f.get(m.member_id),
                                }));
                              const vr = visits
                                .filter(
                                  (v) => v.meeting_id === selectedMeeting.id,
                                )
                                .map((v) => ({
                                  visit_id: v.id,
                                  status: f.get(v.id),
                                }));
                              await write({
                                action: "attendance",
                                meeting_id: selectedMeeting.id,
                                version: selectedMeeting.version,
                                rows: [...rows, ...vr],
                                notes: f.get("notes"),
                              });
                            }}
                          >
                            <div className="hc-attendance-list">
                              {members
                                .filter(
                                  (m) => m.cell_id === selectedMeeting.cell_id,
                                )
                                .map((m) => (
                                  <label key={m.id}>
                                    <span>
                                      <b>{name(m.care_members)}</b>
                                      <small>Registered member</small>
                                    </span>
                                    <select
                                      name={m.member_id}
                                      defaultValue={
                                        data.attendance.find(
                                          (a) =>
                                            a.meeting_id ===
                                              selectedMeeting.id &&
                                            a.member_id === m.member_id,
                                        )?.status || "absent"
                                      }
                                    >
                                      <option value="present">Present</option>
                                      <option value="absent">Absent</option>
                                      <option value="late">Late</option>
                                    </select>
                                  </label>
                                ))}
                              {visits
                                .filter(
                                  (v) => v.meeting_id === selectedMeeting.id,
                                )
                                .map((v) => (
                                  <label key={v.id}>
                                    <span>
                                      <b>
                                        {name(
                                          v.care_members ||
                                            v.care_guest_submissions,
                                        )}
                                      </b>
                                      <small>Visitor</small>
                                    </span>
                                    <select
                                      name={v.id}
                                      defaultValue={
                                        data.attendance.find(
                                          (a) =>
                                            a.meeting_id ===
                                              selectedMeeting.id &&
                                            a.visitor_name === "visit:" + v.id,
                                        )?.status || "present"
                                      }
                                    >
                                      <option value="present">Present</option>
                                      <option value="absent">Absent</option>
                                      <option value="late">Late</option>
                                    </select>
                                  </label>
                                ))}
                            </div>
                            <label>
                              Fellowship notes
                              <textarea
                                name="notes"
                                maxLength={5000}
                                defaultValue={selectedMeeting.notes || ""}
                              />
                            </label>
                            <button disabled={busy}>
                              Save attendance draft
                            </button>
                            <Link
                              className="hc-inline-link"
                              href="/home-cell/visitors"
                            >
                              Register a visitor →
                            </Link>
                          </form>
                        ) : (
                          <>
                            <DataTable head={["Person", "Attendance"]}>
                              {data.attendance
                                .filter(
                                  (a) => a.meeting_id === selectedMeeting.id,
                                )
                                .map((a) => (
                                  <tr key={a.id}>
                                    <td>
                                      {a.member_id
                                        ? name(
                                            members.find(
                                              (m) =>
                                                m.member_id === a.member_id,
                                            )?.care_members || null,
                                          )
                                        : name(
                                            visits.find(
                                              (v) =>
                                                "visit:" + v.id ===
                                                a.visitor_name,
                                            )?.care_guest_submissions || null,
                                          )}
                                    </td>
                                    <td>
                                      <Badge value={a.status} />
                                    </td>
                                  </tr>
                                ))}
                            </DataTable>
                            <p className="hc-muted">
                              Submitted reports are locked until a correction is
                              requested.
                            </p>
                          </>
                        )}
                      </>
                    )}
                    {!selectedMeeting && (
                      <Empty>
                        Select a cell and start a fellowship meeting.
                      </Empty>
                    )}
                  </Panel>
                </>
              )}
              {section === "finances" && (
                <>
                  <Stats
                    items={[
                      {
                        label: "Offerings",
                        value: money(total("offering")),
                        note: "Selected range",
                        icon: "wallet",
                      },
                      {
                        label: "Dues",
                        value: money(total("dues")),
                        note: "Selected range",
                        icon: "wallet",
                      },
                      {
                        label: "Expenses",
                        value: money(total("expense")),
                        note: "Selected range",
                        icon: "wallet",
                      },
                      {
                        label: "Net Movement",
                        value: money(
                          total("offering") + total("dues") - total("expense"),
                        ),
                        note: "Income less expenses",
                        icon: "chart",
                      },
                    ]}
                  />
                  {canWrite && (
                    <Panel title="Record Offering, Dues or Expense">
                      {meetingSelect}
                      {selectedMeeting &&
                      ["draft", "correction_requested"].includes(
                        selectedMeeting.status,
                      ) ? (
                        <form
                          key={"finance:" + selectedMeeting.id}
                          data-draft-key={"finance:" + selectedMeeting.id}
                          className="hc-form-grid"
                          onSubmit={submit("finance", {
                            meeting_id: selectedMeeting.id,
                            version: selectedMeeting.version,
                          })}
                        >
                          <label>
                            Transaction type
                            <select name="kind">
                              <option value="offering">Offering</option>
                              <option value="dues">Dues</option>
                              <option value="expense">Expense</option>
                            </select>
                          </label>
                          <label>
                            Amount (NGN)
                            <input
                              name="amount"
                              type="number"
                              min="0.01"
                              step="0.01"
                              required
                            />
                          </label>
                          <label className="hc-full">
                            Description
                            <input
                              name="description"
                              minLength={3}
                              maxLength={1000}
                              required
                            />
                          </label>
                          <button disabled={busy}>Record transaction</button>
                        </form>
                      ) : (
                        <Empty>
                          Choose an open fellowship meeting. Submitted finances
                          are locked.
                        </Empty>
                      )}
                    </Panel>
                  )}
                  <Panel title="Transaction History">
                    <DataTable
                      head={[
                        "Meeting date",
                        "Home cell",
                        "Type",
                        "Description",
                        "Amount",
                      ]}
                    >
                      {finances.map((f) => {
                        const m = meetings.find((m) => m.id === f.meeting_id);
                        return (
                          <tr key={f.id}>
                            <td>{m?.meeting_date}</td>
                            <td>{m && cellName(m.cell_id)}</td>
                            <td>
                              <Badge value={f.kind} />
                            </td>
                            <td>{f.description}</td>
                            <td>
                              {f.voided_at ? (
                                <>
                                  <s>{money(Number(f.amount))}</s>
                                  <br />
                                  <Badge value="voided" />
                                  <small>{f.void_reason}</small>
                                </>
                              ) : (
                                <>
                                  {money(Number(f.amount))}
                                  {canWrite &&
                                    m &&
                                    ["draft", "correction_requested"].includes(
                                      m.status,
                                    ) && (
                                      <button
                                        className="hc-link-button"
                                        disabled={busy}
                                        onClick={() => {
                                          const reason = prompt(
                                            "Reason for voiding this transaction (at least 5 characters). The original record will be preserved.",
                                          );
                                          if (reason)
                                            void write({
                                              action: "void_finance",
                                              meeting_id: m.id,
                                              version: m.version,
                                              finance_id: f.id,
                                              reason,
                                            });
                                        }}
                                      >
                                        Void
                                      </button>
                                    )}
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </DataTable>
                    {!finances.length && (
                      <Empty>No financial records in this range.</Empty>
                    )}
                  </Panel>
                </>
              )}
              {section === "visitors" && (
                <>
                  <div className="hc-two-col">
                    <div>
                      {canWrite && (
                        <>
                          <Panel title="1 · Check existing records">
                            {peopleSearch}
                          </Panel>
                          <Panel title="2 · Visitor Information">
                            <p className="hc-muted">
                              Choose the dated home-cell gathering this person
                              attended. It keeps their visit with that
                              fellowship’s attendance and weekly report.
                            </p>
                            <div className="hc-visitor-meeting">
                              <h3>Start or open a fellowship</h3>
                              <form
                                data-draft-key={"visitor-meeting:" + activeCell}
                                className="hc-form-row"
                                onSubmit={submit("meeting")}
                              >
                                <label>
                                  Home cell
                                  <select
                                    name="cell_id"
                                    required
                                    key={activeCell}
                                    defaultValue={activeCell}
                                  >
                                    <option value="">Select home cell</option>
                                    {scopedCells.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Fellowship date
                                  <input
                                    name="meeting_date"
                                    type="date"
                                    required
                                    defaultValue={today()}
                                    max={today()}
                                  />
                                </label>
                                <button disabled={busy}>
                                  Start / open this fellowship
                                </button>
                              </form>
                              <p className="hc-muted">
                                Already started? Select it below. One weekly
                                report is kept for each home cell.
                              </p>
                            </div>
                            {meetingSelect}
                            <form
                              data-draft-key="visitor"
                              className="hc-form-grid"
                              onSubmit={async (e) => {
                                e.preventDefault();
                                if (!selectedMeeting) {
                                  setError(
                                    "Select an open fellowship meeting first.",
                                  );
                                  return;
                                }
                                const f = new FormData(e.currentTarget);
                                if (!requestId.current)
                                  requestId.current = crypto.randomUUID();
                                const ok = await write({
                                  ...Object.fromEntries(f),
                                  action: "visitor",
                                  meeting_id: selectedMeeting.id,
                                  cell_id: selectedMeeting.cell_id,
                                  request_id: requestId.current,
                                  ...(chosen
                                    ? {
                                        [chosen.kind === "member"
                                          ? "member_id"
                                          : "guest_submission_id"]:
                                          chosen.person.id,
                                      }
                                    : {}),
                                  contact_consent: f.has("contact_consent"),
                                  email_opt_in: f.has("email_opt_in"),
                                  sms_opt_in: f.has("sms_opt_in"),
                                });
                                if (ok) {
                                  requestId.current = "";
                                  setChosen(null);
                                  setPeople(null);
                                }
                              }}
                            >
                              {!chosen && (
                                <>
                                  <label>
                                    First / other names
                                    <input
                                      name="other_names"
                                      maxLength={120}
                                      required
                                    />
                                  </label>
                                  <label>
                                    Surname
                                    <input
                                      name="surname"
                                      maxLength={100}
                                      required
                                    />
                                  </label>
                                  <label>
                                    Phone number
                                    <input
                                      name="phone"
                                      type="tel"
                                      placeholder="0801 234 5678"
                                      required
                                    />
                                  </label>
                                  <label>
                                    Email address
                                    <input
                                      name="email"
                                      type="email"
                                      maxLength={254}
                                    />
                                  </label>
                                  <label>
                                    Gender
                                    <select name="gender">
                                      <option value="">Select gender</option>
                                      <option>Male</option>
                                      <option>Female</option>
                                    </select>
                                  </label>
                                  <label>
                                    Age group
                                    <select name="age_range">
                                      <option value="">Select age group</option>
                                      {[
                                        "Less than 18",
                                        "18-24",
                                        "25-34",
                                        "35-44",
                                        "45-59",
                                        "60 and above",
                                      ].map((x) => (
                                        <option key={x}>{x}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    WhatsApp (optional)
                                    <input name="whatsapp" type="tel" />
                                  </label>
                                  <label>
                                    Who invited you? (optional)
                                    <input name="invited_by" maxLength={400} />
                                  </label>
                                  <label>
                                    Birthday (optional)
                                    <input
                                      name="birthday"
                                      placeholder="MM-DD"
                                      pattern="[0-9]{2}-[0-9]{2}"
                                    />
                                  </label>
                                  <label>
                                    Anniversary (optional)
                                    <input
                                      name="anniversary"
                                      placeholder="MM-DD"
                                      pattern="[0-9]{2}-[0-9]{2}"
                                    />
                                  </label>
                                  <label className="hc-full">
                                    Address / location
                                    <input name="address" maxLength={600} />
                                  </label>
                                </>
                              )}
                              <label className="hc-full">
                                Additional notes (optional)
                                <textarea name="notes" maxLength={2000} />
                              </label>
                              {!chosen && (
                                <div className="hc-full hc-checks">
                                  <label>
                                    <input
                                      type="checkbox"
                                      name="contact_consent"
                                      defaultChecked
                                    />
                                    May be contacted for follow-up and church
                                    activities
                                  </label>
                                  <label>
                                    <input
                                      type="checkbox"
                                      name="email_opt_in"
                                      defaultChecked
                                    />
                                    Email updates
                                  </label>
                                  <label>
                                    <input
                                      type="checkbox"
                                      name="sms_opt_in"
                                      defaultChecked
                                    />
                                    SMS updates
                                  </label>
                                  <a
                                    href="https://vinebranchchurch.org/guest-terms/"
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    View guest terms and privacy information ↗
                                  </a>
                                </div>
                              )}
                              {chosen && (
                                <p className="hc-muted hc-full">
                                  Existing communication preferences are
                                  preserved. Confirmed identity:{" "}
                                  {name(chosen.person)}.
                                </p>
                              )}
                              <button
                                className="hc-full"
                                disabled={
                                  busy ||
                                  !selectedMeeting ||
                                  !["draft", "correction_requested"].includes(
                                    selectedMeeting.status,
                                  )
                                }
                              >
                                Save Visitor
                              </button>
                            </form>
                          </Panel>
                        </>
                      )}
                      {!canWrite && (
                        <Panel title="Visitor Registration">
                          <Empty>
                            Registration is available in an assigned Cell Leader
                            workspace.
                          </Empty>
                        </Panel>
                      )}
                    </div>
                    <Panel title="Recent Visitors">
                      {visits.map((v) => (
                        <div className="hc-visitor-card" key={v.id}>
                          <div className="hc-person-row">
                            <span className="hc-avatar">
                              {name(v.care_members || v.care_guest_submissions)
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                            <div>
                              <b>
                                {name(
                                  v.care_members || v.care_guest_submissions,
                                )}
                              </b>
                              <small>
                                {v.visited_at.slice(0, 10)} ·{" "}
                                {cellName(v.cell_id)}
                              </small>
                            </div>
                            <Badge value={v.followup_status} />
                          </div>
                          {canWrite && (
                            <form
                              data-draft-key={"followup:" + v.id}
                              className="hc-form-row"
                              onSubmit={submit("followup", { visit_id: v.id })}
                            >
                              <label>
                                Follow-up status
                                <select
                                  name="status"
                                  defaultValue={v.followup_status}
                                >
                                  {[
                                    "pending",
                                    "contacted",
                                    "in_progress",
                                    "completed",
                                    "opted_out",
                                  ].map((s) => (
                                    <option key={s} value={s}>
                                      {labelRole(s)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Notes
                                <input
                                  name="notes"
                                  defaultValue={v.notes || ""}
                                  maxLength={2000}
                                />
                              </label>
                              <button disabled={busy}>Update</button>
                            </form>
                          )}
                        </div>
                      ))}
                      {!visits.length && (
                        <Empty>No visitors in the selected date range.</Empty>
                      )}
                    </Panel>
                  </div>
                </>
              )}
              {section === "reports" && (
                <>
                  <Panel
                    title="Weekly Fellowship Reports"
                    action={
                      <button
                        className="hc-secondary"
                        onClick={() => exportReports()}
                      >
                        Export CSV
                      </button>
                    }
                  >
                    {reportsTable}
                    {!meetings.length && (
                      <Empty>No meetings recorded in this range.</Empty>
                    )}
                  </Panel>
                  <Panel title="Review Consolidated Report">
                    {meetingSelect}
                    {selectedMeeting && (
                      <>
                        <Report meeting={selectedMeeting} data={data} />
                        <AuditHistory
                          meeting={selectedMeeting.id}
                          scope={scope}
                          revision={selectedMeeting.version}
                        />
                        {data.corrections
                          .filter((c) => c.meeting_id === selectedMeeting.id)
                          .map((c) => (
                            <div className="hc-correction" key={c.id}>
                              <Badge value={c.status} />
                              <p>{c.reason}</p>
                              <small>{c.requested_at.slice(0, 10)}</small>
                            </div>
                          ))}
                        {canWrite &&
                          ["draft", "correction_requested"].includes(
                            selectedMeeting.status,
                          ) && (
                            <button
                              disabled={busy}
                              onClick={() => {
                                if (
                                  confirm(
                                    "Submit this consolidated weekly report? Attendance and finances will be locked for review.",
                                  )
                                )
                                  void write({
                                    action: "submit",
                                    meeting_id: selectedMeeting.id,
                                    version: selectedMeeting.version,
                                  });
                              }}
                            >
                              {selectedMeeting.status === "correction_requested"
                                ? "Resubmit Revised Report"
                                : "Submit Weekly Report"}
                            </button>
                          )}
                        {data.manager &&
                          selectedMeeting.status === "submitted" && (
                            <div className="hc-form-grid">
                              {(data.churchAdmin ||
                                data.assignments.some(
                                  (a) =>
                                    a.role === "area_leader" &&
                                    a.area_id ===
                                      data.cells.find(
                                        (c) => c.id === selectedMeeting.cell_id,
                                      )?.area_id,
                                )) && (
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void write({
                                      action: "approve",
                                      meeting_id: selectedMeeting.id,
                                      version: selectedMeeting.version,
                                    })
                                  }
                                >
                                  Approve Report
                                </button>
                              )}
                              <form
                                key={"correction:" + selectedMeeting.id}
                                data-draft-key={
                                  "correction:" + selectedMeeting.id
                                }
                                onSubmit={submit("correction", {
                                  meeting_id: selectedMeeting.id,
                                  version: selectedMeeting.version,
                                })}
                              >
                                <label>
                                  Correction required
                                  <textarea
                                    name="reason"
                                    minLength={5}
                                    maxLength={2000}
                                    required
                                  />
                                </label>
                                <button className="hc-danger" disabled={busy}>
                                  Request Correction
                                </button>
                              </form>
                            </div>
                          )}
                      </>
                    )}
                  </Panel>
                  <Panel title="Cells Without a Started Meeting">
                    <p className="hc-muted">
                      Directory cells with no fellowship recorded in your
                      selected date range. A submission deadline has not been
                      configured.
                    </p>
                    <div className="hc-chips">
                      {scopedCells
                        .filter(
                          (c) => !meetings.some((m) => m.cell_id === c.id),
                        )
                        .map((c) => (
                          <span key={c.id}>{c.name}</span>
                        ))}
                    </div>
                  </Panel>
                </>
              )}
              {section === "communications" && (
                <>
                  <Panel title="Leadership Announcements">
                    {data.announcements
                      .filter(
                        (a) =>
                          (!a.area_id || !area || a.area_id === area) &&
                          (!a.cell_id || ids.has(a.cell_id)),
                      )
                      .map((a) => (
                        <article className="hc-announcement" key={a.id}>
                          <small>
                            {a.created_at.slice(0, 10)} ·{" "}
                            {a.cell_id
                              ? cellName(a.cell_id)
                              : a.area_id
                                ? areaName(a.area_id)
                                : "Church-wide"}
                          </small>
                          <h3>{a.title}</h3>
                          <p>{a.body}</p>
                        </article>
                      ))}
                    {!data.announcements.length && (
                      <Empty>No announcements yet.</Empty>
                    )}
                  </Panel>
                  {data.manager && (
                    <Panel title="Publish Announcement">
                      <form
                        data-draft-key="announcement"
                        className="hc-form-grid"
                        onSubmit={submit("announcement")}
                      >
                        <label>
                          Area
                          <select name="area_id">
                            <option value="">
                              {data.churchAdmin ? "Church-wide" : "Select area"}
                            </option>
                            {data.areas.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Title
                          <input name="title" maxLength={160} required />
                        </label>
                        <label className="hc-full">
                          Message
                          <textarea name="body" maxLength={5000} required />
                        </label>
                        <button disabled={busy}>
                          Publish to leadership workspace
                        </button>
                      </form>
                      <p className="hc-muted">
                        Announcements appear here. This action does not send
                        email or SMS.
                      </p>
                    </Panel>
                  )}
                </>
              )}
              {section === "leaders" &&
                (data.churchAdmin ||
                data.assignments.some((a) => a.role === "coordinator") ? (
                  <LeadershipAccounts />
                ) : (
                  <Panel title="Leadership Accounts">
                    <Empty>
                      Account management requires Church Administrator or
                      Coordinator access.
                    </Empty>
                  </Panel>
                ))}
              {section === "settings" && (
                <>
                  <Panel title="Your Account">
                    <dl className="hc-definition">
                      <dt>Signed-in account</dt>
                      <dd>{data.email}</dd>
                      <dt>Access</dt>
                      <dd>{roleName}</dd>
                      <dt>Timezone</dt>
                      <dd>Africa/Lagos</dd>
                      <dt>Fellowship</dt>
                      <dd>Home-cell meetings only. Default: Sunday, 6–7 PM.</dd>
                    </dl>
                    <button
                      className="hc-secondary"
                      onClick={async () => {
                        const r = await fetch("/api/auth/logout", {
                          method: "POST",
                        });
                        if (r.ok) location.assign("/home-cell/login");
                        else setError("Sign-out failed. Please retry.");
                      }}
                    >
                      Sign out
                    </button>
                  </Panel>
                  <Panel title="Leadership Assignments">
                    <DataTable head={["Role", "Scope"]}>
                      {data.assignments.map((a) => (
                        <tr key={a.id}>
                          <td>{labelRole(a.role)}</td>
                          <td>
                            {a.cell_id
                              ? cellName(a.cell_id)
                              : a.area_id
                                ? areaName(a.area_id)
                                : "Church-wide"}
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  </Panel>
                </>
              )}
            </fieldset>
          )}
        </main>
        <footer className="hc-footer">
          Vine Branch Church · Home Cell Office <span>Africa / Lagos</span>
        </footer>
      </div>
      <nav className="hc-mobile-nav" aria-label="Mobile navigation">
        {(["overview", "members", "visitors", "attendance"] as Section[]).map(
          (x) => (
            <Link
              key={x}
              href={href(x)}
              className={section === x ? "active" : ""}
            >
              <Icon name={icons[x]} />
              <span>{x === "overview" ? "Home" : titles[x]}</span>
            </Link>
          ),
        )}
        <button onClick={() => setMenu(!menu)} aria-expanded={menu}>
          <span>•••</span>More
        </button>
      </nav>
    </div>
  );
  function href(target: Section, extra: Record<string, string> = {}) {
    const q = new URLSearchParams({
      ...(scope ? { scope } : {}),
      ...(area ? { area } : {}),
      ...(cellId ? { cell: cellId } : {}),
      ...(area ? { area } : {}),
      ...(activeCell ? { cell: activeCell } : {}),
      ...extra,
    });
    return (
      (target === "overview" ? "/home-cell" : "/home-cell/" + target) +
      (q.size ? "?" + q : "")
    );
  }
  function meetetingsCount(status: string) {
    return meetings.filter((m) => m.status === status).length;
  }
  function exportReports() {
    const rows = [
      [
        "Date",
        "Home cell",
        "Status",
        "Attendance",
        "Visitors",
        "Offering NGN",
        "Dues NGN",
        "Expenses NGN",
        "Notes",
      ],
      ...meetings.map((m) => [
        m.meeting_date,
        cellName(m.cell_id),
        m.status,
        data!.attendance.filter(
          (a) => a.meeting_id === m.id && a.status !== "absent",
        ).length,
        visits.filter((v) => v.meeting_id === m.id).length,
        ...["offering", "dues", "expense"].map((k) =>
          finances
            .filter(
              (f) => f.meeting_id === m.id && f.kind === k && !f.voided_at,
            )
            .reduce((n, f) => n + Number(f.amount), 0),
        ),
        m.notes || "",
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          .map(
            (x) =>
              '"' +
              String(x)
                .replace(/^\s*[=+\-@]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "home-cell-reports.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
}
function Report({
  meeting: m,
  data,
}: {
  meeting: Meeting;
  data: WorkspaceData;
}) {
  const a = data.attendance.filter((a) => a.meeting_id === m.id),
    f = data.finances.filter((f) => f.meeting_id === m.id && !f.voided_at);
  return (
    <div className="hc-report-summary">
      <Stats
        items={[
          {
            label: "Present / Late",
            value: a.filter((a) => a.status !== "absent").length,
            note: a.filter((a) => a.status === "absent").length + " absent",
            icon: "people",
          },
          {
            label: "Visitors",
            value: data.visits.filter((v) => v.meeting_id === m.id).length,
            note: m.meeting_date,
            icon: "person",
          },
          {
            label: "Income",
            value: money(
              f
                .filter((f) => f.kind !== "expense")
                .reduce((n, f) => n + Number(f.amount), 0),
            ),
            note: "Offerings and dues",
            icon: "wallet",
          },
          {
            label: "Expenses",
            value: money(
              f
                .filter((f) => f.kind === "expense")
                .reduce((n, f) => n + Number(f.amount), 0),
            ),
            note: "Recorded expenses",
            icon: "wallet",
          },
        ]}
      />
      <p className="hc-notes">{m.notes || "No fellowship notes recorded."}</p>
    </div>
  );
}
