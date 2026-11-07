"use client";
import { useEffect, useState } from "react";
import "./home-cell/leader-app.css";
import "./cfc.css";
type Cohort = { id: string; name: string; starts_on: string };
type Session = {
  id: string;
  cohort_id: string;
  lesson: number;
  held_on: string;
  topic: string;
  venue: string;
};
type Attendance = {
  session_id: string;
  lesson: number;
  date: string;
  status: string;
  cohort_id: string;
  cohort_name?: string;
};
type Certificate = {
  certificate_number?: string;
  certificate_awarded_on?: string;
  certificate_ready_on?: string;
  certificate_collected_on?: string;
  certificate_collected_by_name?: string;
};
type Baptism = Certificate & {
  member_id: string;
  name: string;
  scheduled_on?: string;
  baptised_on?: string;
};
type Person = Certificate & {
  id: string;
  name: string;
  phone?: string;
  cohorts: string[];
  attendance: Attendance[];
  completed_on?: string;
  review?: { submitted_at?: string; approved_at?: string };
};
export type CfcData = {
  manager: boolean;
  canOrganize: boolean;
  name: string;
  cohorts: Cohort[];
  sessions: Session[];
  people: Person[];
  leaders: { user_id: string; name: string; active: boolean }[];
  baptisms?: Baptism[];
  candidates: { id: string; name: string }[];
  teaching: { cohort_id: string; user_id: string }[];
};
const lessons = [1, 2, 3, 4, 5, 6, 7];
export const completedLessons = (p: Person) => [
  ...new Set(
    p.attendance.filter((a) => a.status === "present").map((a) => a.lesson),
  ),
];
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const labelDate = (s: string) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export default function CfcDashboard({
  initial,
  embedded = false,
}: {
  initial?: CfcData;
  embedded?: boolean;
}) {
  const [data, setData] = useState<CfcData | undefined>(initial),
    [tab, setTab] = useState("Classes"),
    [dark, setDark] = useState(false),
    [search, setSearch] = useState(""),
    [adding, setAdding] = useState(false),
    [memberSearch, setMemberSearch] = useState(""),
    [matches, setMatches] = useState<CfcData["candidates"]>([]),
    [lookupBusy, setLookupBusy] = useState(false),
    [attendanceSearch, setAttendanceSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [cohort, setCohort] = useState(""),
    [session, setSession] = useState(""),
    [person, setPerson] = useState<Person | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [attendanceBack, setAttendanceBack] = useState("Classes"),
    [marks, setMarks] = useState<Record<string, "present" | "absent">>({}),
    [correction, setCorrection] = useState("");
  async function load(query = "") {
    const r = await fetch("/api/cfc?search=" + encodeURIComponent(query), {
      cache: "no-store",
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.message);
    setData(d);
    return d as CfcData;
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    try {
      setDark(localStorage.getItem("hco-reference-theme") === "dark");
    } catch {}
  }, []);
  async function write(action: string, values: Record<string, unknown>) {
    const r = await fetch("/api/cfc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data: values }),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.message);
  }
  async function save(action: string, values: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await write(action, values);
      await load();
      setNotice("Saved successfully.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  function form(action: string, fields: React.ReactNode) {
    return (
      <form
        className="cfc-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = e.currentTarget;
          if (await save(action, Object.fromEntries(new FormData(f))))
            f.reset();
        }}
      >
        {fields}
        <button disabled={busy}>
          {(
            {
              enrol: "Enrol participant",
              baptism_register: "Register member",
              baptism_schedule: "Save schedule",
              baptism_complete: "Confirm baptism",
              certificate_issue: "Record issue",
              certificate_ready: "Mark ready",
              certificate_collect: "Confirm collection",
            } as Record<string, string>
          )[action] || "Save"}
        </button>
      </form>
    );
  }
  function matchesPerson(
    p: { name: string; phone?: string | null },
    query: string,
  ) {
    const digits = query.replace(/\D/g, "").replace(/^0/, "");
    return (
      p.name.toLowerCase().includes(query.trim().toLowerCase()) ||
      (/^[+0-9 ()-]+$/.test(query) &&
        digits.length >= 3 &&
        !!p.phone?.replace(/\D/g, "").includes(digits))
    );
  }
  function memberLookup(action: "enrol" | "baptism_register") {
    return (
      <section className="cfc-card">
        <p>
          Choose an existing church member. A joining date is not required for
          confirmed long-standing members.
        </p>
        <form
          className="cfc-search"
          onSubmit={async (e) => {
            e.preventDefault();
            setLookupBusy(true);
            setError("");
            setMatches([]);
            try {
              const r = await fetch(
                "/api/cfc?search=" + encodeURIComponent(memberSearch.trim()),
                { cache: "no-store" },
              );
              const result = await r.json();
              if (!r.ok) throw Error(result.message);
              setMatches(result.candidates);
              if (!result.candidates.length)
                setNotice("No confirmed members found.");
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Member search failed.",
              );
            } finally {
              setLookupBusy(false);
            }
          }}
        >
          <input
            aria-label="Search church members"
            placeholder="Name or phone number"
            required
            minLength={2}
            maxLength={120}
            value={memberSearch}
            onChange={(e) => {
              setMemberSearch(e.target.value);
              setMatches([]);
              setNotice("");
            }}
          />
          <button disabled={lookupBusy}>
            {lookupBusy ? "Searching…" : "Find member"}
          </button>
        </form>
        {matches.length > 0 &&
          form(
            action,
            <>
              <label>
                Member
                <select name="member" required>
                  <option value="">Choose member</option>
                  {matches.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {action === "enrol" && (
                <label>
                  Cohort
                  <select name="cohort" required defaultValue={cohort}>
                    <option value="">Choose cohort</option>
                    {cohortOptions()}
                  </select>
                </label>
              )}
            </>,
          )}
      </section>
    );
  }
  function certificate(
    p: Certificate,
    id: string,
    kind: "cfc" | "baptism",
    milestone?: string,
  ) {
    const action = !p.certificate_number
      ? "certificate_issue"
      : !p.certificate_ready_on
        ? "certificate_ready"
        : "certificate_collect";
    return (
      <section className="cfc-card">
        <h3>{kind === "cfc" ? "CFC certificate" : "Baptism certificate"}</h3>
        {!milestone ? (
          <p>
            Record{" "}
            {kind === "cfc" ? "approved CFC completion" : "actual baptism"}{" "}
            first.
          </p>
        ) : (
          <>
            <p>
              {p.certificate_collected_on
                ? "Collected"
                : p.certificate_ready_on
                  ? "Ready for collection"
                  : p.certificate_number
                    ? "Issued"
                    : "Not issued"}
              {p.certificate_number && " · " + p.certificate_number}
            </p>
            {p.certificate_awarded_on && (
              <p>Issued: {labelDate(p.certificate_awarded_on)}</p>
            )}
            {p.certificate_collected_on ? (
              <p>
                Collected {labelDate(p.certificate_collected_on)}
                {p.certificate_collected_by_name &&
                  " · handed over by " + p.certificate_collected_by_name}
              </p>
            ) : (
              form(
                action,
                <>
                  <input type="hidden" name="member" value={id} />
                  <input type="hidden" name="kind" value={kind} />
                  {action === "certificate_issue" && (
                    <label>
                      Certificate number
                      <input name="number" required maxLength={100} />
                    </label>
                  )}
                  <label>
                    {action === "certificate_issue"
                      ? "Issue date"
                      : action === "certificate_ready"
                        ? "Ready for collection date"
                        : "Collection date"}
                    <input
                      type="date"
                      name="date"
                      required
                      defaultValue={today()}
                      min={
                        p.certificate_ready_on ||
                        p.certificate_awarded_on ||
                        milestone
                      }
                      max={today()}
                    />
                  </label>
                </>,
              )
            )}
          </>
        )}
      </section>
    );
  }
  const current = data?.people.find((p) => p.id === person?.id) || person;
  const visiblePeople = (data?.people || []).filter(
    (p) =>
      (!cohort || p.cohorts.includes(cohort)) &&
      matchesPerson(p, search) &&
      (filter === "all" ||
        (filter === "complete"
          ? completedLessons(p).length === 7
          : completedLessons(p).length < 7)),
  );
  const sessions = (data?.sessions || []).filter(
    (s) => !cohort || s.cohort_id === cohort,
  );
  function cohortOptions() {
    return data?.cohorts.map((c) => (
      <option key={c.id} value={c.id}>
        {c.name}
      </option>
    ));
  }
  function exportCsv() {
    const rows = [
      ["Name", "Completed classes", "Missing classes", "Completed on"],
      ...visiblePeople.map((p) => [
        p.name,
        completedLessons(p).join(" / "),
        lessons.filter((n) => !completedLessons(p).includes(n)).join(" / "),
        p.completed_on || "",
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          .map(
            (v) =>
              '"' +
              (/^[=+@\-\t\r]/.test(v) ? "'" : "") +
              v.replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "CFC_Class_Progress.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const orderedSessions = [...(data?.sessions || [])].sort((a, b) =>
    a.held_on.localeCompare(b.held_on),
  );
  const next = orderedSessions.find((s) => s.held_on >= today());
  const selected = orderedSessions.find((s) => s.id === session);
  const roster = selected
    ? (data?.people || []).filter((p) => p.cohorts.includes(selected.cohort_id))
    : [];
  const saved = (p: Person) =>
    p.attendance.find((a) => a.session_id === session)?.status;
  const changes = roster.filter(
    (p) => !p.completed_on && marks[p.id] && marks[p.id] !== saved(p),
  );
  const corrections = changes.filter(saved);
  const missed = (p: Person) =>
    [
      ...new Set(
        p.attendance
          .filter(
            (a) =>
              a.status === "absent" && !completedLessons(p).includes(a.lesson),
          )
          .map((a) => a.lesson),
      ),
    ].sort();
  const missing = current
    ? lessons.filter((n) => !completedLessons(current).includes(n))
    : [];
  const makeups = orderedSessions.filter(
    (s) => missing.includes(s.lesson) && s.held_on >= today(),
  );
  const firstMakeup = makeups[0];
  const scheduledBaptisms = (data?.baptisms || [])
    .filter((p) => p.scheduled_on && !p.baptised_on)
    .sort((a, b) => a.scheduled_on!.localeCompare(b.scheduled_on!));
  const personBaptism = data?.baptisms?.find(
    (p) => p.member_id === current?.id,
  );
  const classDate = (s: Session) =>
    new Date(s.held_on + "T12:00:00Z").toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const baptismStatus = (p?: Baptism) =>
    p?.baptised_on
      ? "Baptised · " + labelDate(p.baptised_on)
      : p?.scheduled_on
        ? "Scheduled · " + labelDate(p.scheduled_on)
        : p
          ? "Registered"
          : "Not registered";
  const avatar = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  function go(screen: string) {
    if (!embedded && typeof window.scrollTo === "function" && window.scrollY)
      window.scrollTo(0, 0);
    setTab(screen);
    setAdding(false);
    setSearch("");
    setMemberSearch("");
    setMatches([]);
    setNotice("");
    setError("");
  }
  function openPerson(p: Person) {
    go("Person");
    setPerson(p);
  }
  function openAttendance(s: Session) {
    setAttendanceBack(tab === "Plan" ? "Plan" : "Classes");
    go("Attendance");
    setSession(s.id);
    setMarks({});
    setCorrection("");
    setAttendanceSearch("");
  }
  function makeUpButton(s: Session, p: Person, label: string) {
    return p.cohorts.includes(s.cohort_id) ? (
      <span>Enrolled</span>
    ) : data?.canOrganize ? (
      <button
        className="lx-btn lx-primary"
        disabled={busy}
        onClick={() =>
          void save("enrol", { member: p.id, cohort: s.cohort_id })
        }
      >
        {label}
      </button>
    ) : (
      <span>Ask the coordinator to add this participant.</span>
    );
  }
  async function saveAttendance() {
    if (
      !selected ||
      busy ||
      !changes.length ||
      selected.held_on > today() ||
      (corrections.length && correction.trim().length < 5)
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    let count = 0;
    try {
      for (const p of changes) {
        const status = marks[p.id];
        await write("attendance", {
          member: p.id,
          session: selected.id,
          status,
          note: saved(p) ? correction.trim() : "",
        });
        count++;
        setData(
          (prev) =>
            prev && {
              ...prev,
              people: prev.people.map((row) =>
                row.id !== p.id
                  ? row
                  : {
                      ...row,
                      attendance: [
                        ...row.attendance.filter(
                          (a) => a.session_id !== selected.id,
                        ),
                        {
                          session_id: selected.id,
                          cohort_id: selected.cohort_id,
                          lesson: selected.lesson,
                          date: selected.held_on,
                          status,
                          cohort_name: prev.cohorts.find(
                            (c) => c.id === selected.cohort_id,
                          )?.name,
                        },
                      ],
                    },
              ),
            },
        );
        setMarks((prev) => {
          const rest = { ...prev };
          delete rest[p.id];
          return rest;
        });
      }
      setCorrection("");
      setNotice("Attendance saved.");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save attendance.";
      setError(
        (count ? count + " saved. " : "") +
          message +
          " Unsaved marks are still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  function baptismCard(p: Baptism) {
    return (
      <article className="cfc-card" key={p.member_id}>
        <h2>{p.name}</h2>
        <p>
          {p.baptised_on
            ? "Baptised · " + labelDate(p.baptised_on)
            : p.scheduled_on
              ? "Scheduled · " + labelDate(p.scheduled_on)
              : "Registered"}
        </p>
        {!p.baptised_on && (
          <>
            {form(
              "baptism_schedule",
              <>
                <input type="hidden" name="member" value={p.member_id} />
                <label>
                  Schedule baptism
                  <input type="date" name="date" required min={today()} />
                </label>
              </>,
            )}
            {form(
              "baptism_complete",
              <>
                <input type="hidden" name="member" value={p.member_id} />
                <label>
                  Actual baptism date
                  <input type="date" name="date" required max={today()} />
                </label>
              </>,
            )}
          </>
        )}
        {certificate(p, p.member_id, "baptism", p.baptised_on)}
      </article>
    );
  }
  const back =
    tab === "Person"
      ? "People"
      : tab === "Attendance"
        ? attendanceBack
        : ["Plan", "Baptism"].includes(tab)
          ? "Classes"
          : "";
  const active =
    tab === "Person"
      ? "People"
      : ["Plan", "Baptism"].includes(tab)
        ? "Classes"
        : tab;
  const helpBar = (
    <button className="lx-helpbar" onClick={() => go("Help")}>
      ☎ Need help? <strong>Call your Coordinator</strong>
    </button>
  );
  return (
    <main
      className={`lx-app cfc-app ${dark ? "lx-dark" : ""} ${embedded ? "cfc-embedded" : ""}`}
    >
      <div className="lx-screen">
        <header className="lx-top">
          {back && (
            <button
              type="button"
              className="lx-back"
              disabled={busy}
              onClick={() => go(back)}
            >
              ‹ {back === "Plan" ? "Plan classes" : back}
            </button>
          )}
          <div className="lx-brand">
            {!back && <img src="/assets/image-7d4e31b34082.png" alt="" />}
            <span>
              <small>
                {tab === "Attendance" && selected
                  ? "Class " + selected.lesson + " · " + classDate(selected)
                  : "Foundational Class"}
              </small>
              <b>Vine Branch Church</b>
            </span>
          </div>
          <button
            type="button"
            className="lx-theme"
            aria-label={"Switch to " + (dark ? "light" : "dark") + " mode"}
            onClick={() => {
              setDark(!dark);
              try {
                localStorage.setItem(
                  "hco-reference-theme",
                  dark ? "light" : "dark",
                );
              } catch {}
            }}
          >
            {dark ? "☀" : "☾"}
          </button>
        </header>
        <h1 className="lx-title">
          {tab === "Person"
            ? current?.name
            : tab === "Attendance"
              ? "Who came?"
              : tab === "Plan"
                ? "Plan classes"
                : tab}
        </h1>
        {error && (
          <p className="lx-alert" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="lx-notice" role="status">
            {notice}
          </p>
        )}
        {!data ? (
          <>
            <p>Loading your classes…</p>
            {error && (
              <button
                className="lx-btn"
                onClick={() =>
                  void load()
                    .then(() => setError(""))
                    .catch((e) => setError(e.message))
                }
              >
                Retry loading
              </button>
            )}
          </>
        ) : (
          <>
            {tab === "Classes" && (
              <>
                <section className="lx-card lx-plain cfc-next">
                  <span className="lx-label">NEXT CLASS</span>
                  <h2>
                    {next
                      ? "Class " + next.lesson + " · " + next.topic
                      : "No upcoming class scheduled"}
                  </h2>
                  {next && (
                    <>
                      <p className="lx-muted">
                        {[
                          data.cohorts.find((c) => c.id === next.cohort_id)
                            ?.name,
                          classDate(next),
                          next.venue || "Venue to be confirmed",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <button
                        className="lx-btn lx-primary"
                        onClick={() => openAttendance(next)}
                      >
                        ✓ Take attendance
                      </button>
                    </>
                  )}
                </section>
                <section className="lx-card lx-soft">
                  <h2>Needs a make-up class</h2>
                  {data.people
                    .filter((p) => !p.completed_on && missed(p).length)
                    .slice(0, 5)
                    .map((p) => (
                      <div className="lx-person" key={p.id}>
                        <span className="lx-av" aria-hidden>
                          {avatar(p.name)}
                        </span>
                        <button
                          className="cfc-text-button lx-pt"
                          onClick={() => openPerson(p)}
                        >
                          <b>{p.name}</b>
                          <small className="lx-warn-text">
                            Missed{" "}
                            {missed(p)
                              .map((n) => "Class " + n)
                              .join(", ")}
                          </small>
                        </button>
                        {p.phone && (
                          <a
                            className="lx-sq"
                            href={"tel:" + p.phone}
                            aria-label={"Call " + p.name}
                          >
                            ☎
                          </a>
                        )}
                      </div>
                    ))}
                  {!data.people.some(
                    (p) => !p.completed_on && missed(p).length,
                  ) && (
                    <p className="lx-muted">No missed classes to make up.</p>
                  )}
                </section>
                <section className="lx-card lx-list">
                  <button className="lx-task" onClick={() => go("Plan")}>
                    <span aria-hidden>▣</span>
                    <span className="lx-tt">
                      <b>Plan classes</b>
                      <small>Groups, dates and topics</small>
                    </span>
                    <span aria-hidden>›</span>
                  </button>
                </section>
                <section className="lx-card lx-list">
                  <button className="lx-task" onClick={() => go("Baptism")}>
                    <span aria-hidden>◇</span>
                    <span className="lx-tt">
                      <b>Baptism</b>
                      <small>
                        {scheduledBaptisms.length
                          ? scheduledBaptisms.length +
                            " scheduled · " +
                            labelDate(scheduledBaptisms[0].scheduled_on!)
                          : "Register and schedule"}
                      </small>
                    </span>
                    <span aria-hidden>›</span>
                  </button>
                </section>
                {helpBar}
              </>
            )}
            {(tab === "Plan" || tab === "People") && (
              <label className="lx-field">
                Cohort
                <select
                  value={cohort}
                  onChange={(e) => setCohort(e.target.value)}
                >
                  <option value="">All cohorts</option>
                  {cohortOptions()}
                </select>
              </label>
            )}
            {tab === "People" && (
              <>
                <button
                  className="cfc-primary"
                  onClick={() => setAdding(!adding)}
                  aria-expanded={adding}
                >
                  {adding ? "Close enrolment" : "Add participant"}
                </button>
                {adding && memberLookup("enrol")}
                <label>
                  Search participants
                  <input
                    placeholder="Name or phone number"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <div className="cfc-pills">
                  {[
                    ["all", "All"],
                    ["missing", "In progress"],
                    ["complete", "7 of 7"],
                  ].map(([key, name]) => (
                    <button
                      key={key}
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <button className="cfc-secondary" onClick={exportCsv}>
                  Export visible progress
                </button>
                {visiblePeople.map((p) => (
                  <article className="cfc-card" key={p.id}>
                    <h2>{p.name}</h2>
                    <p>
                      {completedLessons(p).length} of 7 distinct classes
                      completed
                    </p>
                    <div className="cfc-actions">
                      <button onClick={() => openPerson(p)}>
                        View progress
                      </button>
                      {p.phone && <a href={"tel:" + p.phone}>Call</a>}
                    </div>
                  </article>
                ))}
                {!visiblePeople.length && <p>No matching participants.</p>}
              </>
            )}
            {tab === "Person" && current && (
              <>
                <section
                  className="lx-card lx-plain"
                  aria-label="Participant progress"
                >
                  <h2>{completedLessons(current).length} of 7 classes done</h2>
                  <div
                    className="cfc-progress"
                    role="list"
                    aria-label="Class progress"
                  >
                    {lessons.map((n) => {
                      const done = !missing.includes(n);
                      return (
                        <span
                          key={n}
                          role="listitem"
                          aria-label={`Class ${n}: ${done ? "done" : "missing"}`}
                          className={done ? "done" : "missed"}
                        >
                          {n}
                        </span>
                      );
                    })}
                  </div>
                  {missing.length > 0 && (
                    <p className="lx-notice lx-warn">
                      <span>▣</span>
                      <span>
                        <strong>
                          Missing {missing.map((n) => "Class " + n).join(", ")}.
                        </strong>{" "}
                        {firstMakeup
                          ? "Next Class " +
                            firstMakeup.lesson +
                            " is " +
                            classDate(firstMakeup) +
                            "."
                          : "No make-up class is scheduled yet."}
                      </span>
                    </p>
                  )}
                  {firstMakeup &&
                    makeUpButton(firstMakeup, current, "Add to that class")}
                  {current.completed_on && (
                    <p>Completed {labelDate(current.completed_on)}</p>
                  )}
                </section>
                <section className="lx-card lx-list">
                  <details className="cfc-details">
                    <summary>
                      Certificate{" "}
                      <strong>
                        {current.certificate_collected_on
                          ? "Collected"
                          : current.certificate_ready_on
                            ? "Ready for collection"
                            : current.certificate_number
                              ? "Issued"
                              : current.completed_on
                                ? "Not issued"
                                : missing.length
                                  ? "After 7 of 7"
                                  : "Awaiting approval"}
                      </strong>
                    </summary>
                    {certificate(
                      current,
                      current.id,
                      "cfc",
                      current.completed_on,
                    )}
                  </details>
                  <details className="cfc-details">
                    <summary>
                      Baptism <strong>{baptismStatus(personBaptism)}</strong>
                    </summary>
                    {personBaptism ? (
                      baptismCard(personBaptism)
                    ) : (
                      <button
                        className="lx-btn"
                        disabled={busy}
                        onClick={() =>
                          void save("baptism_register", { member: current.id })
                        }
                      >
                        Register for baptism
                      </button>
                    )}
                  </details>
                </section>
                {current.phone && (
                  <div className="lx-two">
                    <a className="lx-btn" href={"tel:" + current.phone}>
                      ☎ Call
                    </a>
                    <a
                      className="lx-btn lx-wabtn"
                      href={
                        "https://wa.me/" +
                        current.phone.replace(/\D/g, "").replace(/^0/, "234")
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  </div>
                )}
                {!current.completed_on && !missing.length && (
                  <>
                    <button
                      className="lx-btn lx-primary"
                      disabled={busy}
                      onClick={() =>
                        void save("submit", { member: current.id })
                      }
                    >
                      {current.review?.submitted_at
                        ? "Resubmit for review"
                        : "Submit completion for review"}
                    </button>
                    {data.manager && current.review?.submitted_at && (
                      <button
                        className="lx-btn"
                        disabled={busy}
                        onClick={() =>
                          void save("approve", { member: current.id })
                        }
                      >
                        Approve completion
                      </button>
                    )}
                  </>
                )}
                {makeups.length > 1 && (
                  <details className="lx-card cfc-details">
                    <summary>More make-up opportunities</summary>
                    {makeups.slice(1).map((s) => (
                      <div key={s.id}>
                        <p>
                          Class {s.lesson} · {classDate(s)} ·{" "}
                          {data.cohorts.find((c) => c.id === s.cohort_id)?.name}
                        </p>
                        {makeUpButton(s, current, "Schedule make-up")}
                      </div>
                    ))}
                  </details>
                )}
                <details className="lx-card cfc-details">
                  <summary>Attendance history</summary>
                  {current.attendance.length ? (
                    current.attendance.map((a) => (
                      <p key={a.session_id}>
                        Class {a.lesson} · {a.status} · {labelDate(a.date)} ·{" "}
                        {a.cohort_name || "Earlier cohort"}
                      </p>
                    ))
                  ) : (
                    <p>No attendance recorded yet.</p>
                  )}
                </details>
              </>
            )}
            {tab === "Plan" && (
              <>
                <button
                  className="lx-btn"
                  onClick={() => {
                    setCohort("");
                    go("People");
                  }}
                >
                  Find attendance by participant
                </button>
                <section
                  className="lx-card lx-list"
                  aria-label="Attendance by cohort"
                >
                  <h2 className="lx-pad">Attendance by cohort</h2>
                  {[...sessions]
                    .sort((a, b) => b.held_on.localeCompare(a.held_on))
                    .map((s) => (
                      <button
                        key={s.id}
                        className="lx-task"
                        onClick={() => openAttendance(s)}
                      >
                        <span className="lx-tt">
                          <b>
                            Class {s.lesson} · {s.topic}
                          </b>
                          <small>
                            {labelDate(s.held_on)} ·{" "}
                            {
                              data.cohorts.find((c) => c.id === s.cohort_id)
                                ?.name
                            }
                          </small>
                        </span>
                        <span aria-hidden>›</span>
                      </button>
                    ))}
                  {!sessions.length && (
                    <p className="lx-pad">No classes scheduled.</p>
                  )}
                </section>
                {data.canOrganize && (
                  <>
                    <h2>Schedule a class</h2>
                    {form(
                      "session",
                      <>
                        <label>
                          Cohort
                          <select name="cohort" required>
                            <option value="">Choose cohort</option>
                            {cohortOptions()}
                          </select>
                        </label>
                        <label>
                          Class number
                          <select name="lesson">
                            {lessons.map((n) => (
                              <option key={n}>{n}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Topic
                          <input name="topic" required maxLength={160} />
                        </label>
                        <label>
                          Date
                          <input name="date" type="date" required />
                        </label>
                        <label>
                          Venue
                          <input name="venue" maxLength={200} />
                        </label>
                      </>,
                    )}
                    <h2>Create cohort</h2>
                    {form(
                      "cohort",
                      <>
                        <label>
                          Name
                          <input name="name" required maxLength={120} />
                        </label>
                        <label>
                          Start date
                          <input name="date" type="date" required />
                        </label>
                      </>,
                    )}
                    <button
                      className="cfc-secondary"
                      onClick={() => {
                        go("People");
                        setAdding(true);
                      }}
                    >
                      Add participant or arrange a make-up
                    </button>
                  </>
                )}
              </>
            )}
            {tab === "Attendance" && selected && (
              <>
                {selected.held_on > today() ? (
                  <p className="lx-notice">
                    Attendance opens on the class date.
                  </p>
                ) : (
                  <button
                    className="lx-btn"
                    disabled={busy || !roster.some((p) => !p.completed_on)}
                    onClick={() =>
                      setMarks(
                        Object.fromEntries(
                          roster
                            .filter((p) => !p.completed_on)
                            .map((p) => [p.id, "present"]),
                        ),
                      )
                    }
                  >
                    ✓ Everyone came
                  </button>
                )}
                <p className="lx-count lx-center">
                  <b>
                    {
                      roster.filter(
                        (p) => (marks[p.id] ?? saved(p)) === "present",
                      ).length
                    }
                  </b>{" "}
                  came ·{" "}
                  <b>
                    {
                      roster.filter(
                        (p) => (marks[p.id] ?? saved(p)) === "absent",
                      ).length
                    }
                  </b>{" "}
                  absent
                </p>
                <section className="lx-card lx-list">
                  {roster
                    .filter((p) => matchesPerson(p, attendanceSearch))
                    .map((p) => (
                      <div className="lx-att" key={p.id}>
                        <span className="lx-av" aria-hidden>
                          {avatar(p.name)}
                        </span>
                        <div>
                          <b>{p.name}</b>
                          {p.completed_on && (
                            <small className="lx-muted cfc-readonly">
                              Completion confirmed
                            </small>
                          )}
                        </div>
                        <div
                          className="lx-seg cfc-seg"
                          aria-label={"Attendance for " + p.name}
                          role="group"
                        >
                          {(["present", "absent"] as const).map((status) => (
                            <button
                              key={status}
                              disabled={
                                busy ||
                                selected.held_on > today() ||
                                !!p.completed_on
                              }
                              aria-pressed={
                                (marks[p.id] ?? saved(p)) === status
                              }
                              className={
                                (marks[p.id] ?? saved(p)) === status
                                  ? "on " + (status === "present" ? "c" : "a")
                                  : undefined
                              }
                              onClick={() => {
                                setError("");
                                setNotice("");
                                setMarks((prev) => ({
                                  ...prev,
                                  [p.id]: status,
                                }));
                              }}
                            >
                              {(marks[p.id] ?? saved(p)) === status && (
                                <span aria-hidden>✓ </span>
                              )}
                              {status === "present" ? "Came" : "Absent"}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  {!roster.some((p) => matchesPerson(p, attendanceSearch)) && (
                    <p className="lx-pad">No matching participants.</p>
                  )}
                </section>
                {roster.length > 0 && (
                  <details className="lx-card cfc-details">
                    <summary>Find participant in this session</summary>
                    <input
                      aria-label="Search session roster"
                      value={attendanceSearch}
                      onChange={(e) => setAttendanceSearch(e.target.value)}
                      placeholder="Name or phone number"
                    />
                  </details>
                )}
                {!!corrections.length && (
                  <label className="lx-field">
                    Reason for changing a saved mark
                    <input
                      value={correction}
                      disabled={busy}
                      maxLength={1000}
                      onChange={(e) => setCorrection(e.target.value)}
                      placeholder="At least 5 characters"
                    />
                  </label>
                )}
                {selected.held_on <= today() && (
                  <div className="lx-stick">
                    <button
                      className="lx-btn lx-primary"
                      disabled={
                        busy ||
                        !changes.length ||
                        (!!corrections.length && correction.trim().length < 5)
                      }
                      onClick={() => void saveAttendance()}
                    >
                      {busy ? "Saving…" : "Save attendance"}
                    </button>
                  </div>
                )}
              </>
            )}
            {tab === "Baptism" && (
              <>
                <p>Register water baptism separately from CFC completion.</p>
                <button
                  className="cfc-primary"
                  aria-expanded={adding}
                  onClick={() => setAdding(!adding)}
                >
                  {adding ? "Close registration" : "Register for baptism"}
                </button>
                {adding && memberLookup("baptism_register")}
                <label>
                  Search baptism register
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name"
                  />
                </label>
                {(data.baptisms || [])
                  .filter((p) => matchesPerson(p, search))
                  .map((p) => baptismCard(p))}
              </>
            )}
            {tab === "Help" && (
              <>
                <p className="lx-notice">
                  Need help? Call your Follow Through Coordinator.
                </p>
                <section className="cfc-card">
                  <h2>{data.name}</h2>
                  <p>
                    {data.manager
                      ? "Follow Through coordinator"
                      : "Foundational Class leader"}
                  </p>
                  <p>
                    Your dashboard contains CFC classes and participants.
                    Completed classes carry across cohorts.
                  </p>
                  <button
                    className="cfc-primary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const r = await fetch("/api/auth/logout", {
                          method: "POST",
                        });
                        if (!r.ok) throw Error("Log out failed. Try again.");
                        window.location.replace("/cfc-login");
                      } catch (e) {
                        setError((e as Error).message);
                        setBusy(false);
                      }
                    }}
                  >
                    Log out
                  </button>
                </section>
              </>
            )}
          </>
        )}
      </div>
      {tab !== "Attendance" && (
        <nav className="lx-tabs" aria-label="CFC dashboard">
          {["Classes", "People", "Help"].map((name, i) => (
            <button
              key={name}
              aria-current={active === name ? "page" : undefined}
              disabled={busy}
              onClick={() => go(name)}
            >
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  d={
                    [
                      "M4 3h16v16H7l-3 2z",
                      "M9 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6M3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 6",
                      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M10 9a2 2 0 1 1 3 2c-1 .5-1 1-1 2m0 4h.01",
                    ][i]
                  }
                />
              </svg>
              {name}
            </button>
          ))}
        </nav>
      )}
    </main>
  );
}
