"use client";
import { useEffect, useState } from "react";
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
    [tab, setTab] = useState("Today"),
    [dark, setDark] = useState(true),
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
    const theme = localStorage.getItem("vbc-cfc-theme");
    if (theme) setDark(theme === "dark");
  }, []);
  async function save(action: string, values: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/cfc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data: values }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.message);
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
  const next = sessions.find((s) => s.held_on >= today());
  const selectedSession = data?.sessions.find((s) => s.id === session);
  function attendance(p: Person) {
    return (
      <div
        className="cfc-progress"
        aria-label={completedLessons(p).length + " of 7 classes completed"}
      >
        {lessons.map((n) => (
          <span
            key={n}
            className={
              completedLessons(p).includes(n)
                ? "done"
                : p.attendance.some(
                      (a) => a.lesson === n && a.status === "absent",
                    )
                  ? "missed"
                  : ""
            }
          >
            <small>C{n}</small>
            {completedLessons(p).includes(n)
              ? "✓"
              : p.attendance.some(
                    (a) => a.lesson === n && a.status === "absent",
                  )
                ? "−"
                : "·"}
          </span>
        ))}
      </div>
    );
  }
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
  return (
    <main
      className={
        "cfc-app " +
        (dark ? "cfc-dark" : "cfc-light") +
        (embedded ? " cfc-embedded" : "")
      }
    >
      <header className="cfc-header">
        <div className="cfc-brand">
          <img src="/assets/image-7d4e31b34082.png" alt="Vine Branch Church" />
          <span>
            <b>VINE BRANCH CHURCH</b>
            <small>Foundational Classes</small>
          </span>
        </div>
        <button
          aria-label="Toggle colour theme"
          onClick={() =>
            setDark((d) => {
              localStorage.setItem("vbc-cfc-theme", d ? "light" : "dark");
              return !d;
            })
          }
        >
          {dark ? "☀" : "☾"}
        </button>
      </header>
      <div className="cfc-body">
        <p>Hello, {data?.name || "Class leader"}</p>
        <h1>{tab === "Today" ? "MY CLASSES" : tab.toUpperCase()}</h1>
        <p className="cfc-muted">
          {data?.manager
            ? "Coordinate classes, make-ups and completion reviews."
            : "Help every person grow in faith."}
        </p>
        {error && (
          <div className="cfc-alert" role="alert">
            {error}
            <button
              onClick={() =>
                void load()
                  .then(() => setError(""))
                  .catch((e) => setError(e.message))
              }
            >
              Retry loading
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="cfc-notice">
            {notice}
          </p>
        )}
        {!data ? (
          <p>Loading your CFC classes…</p>
        ) : (
          <>
            {tab !== "Account" && tab !== "Baptism" && (
              <label className="cfc-select">
                Cohort
                <select
                  value={cohort}
                  onChange={(e) => {
                    setCohort(e.target.value);
                    setSession("");
                  }}
                >
                  <option value="">All cohorts</option>
                  {cohortOptions()}
                </select>
              </label>
            )}
            {tab === "Today" && (
              <>
                <div className="cfc-metrics">
                  <div>
                    <b>{data.people.length}</b>
                    <small>Participants</small>
                  </div>
                  <div>
                    <b>{data.cohorts.length}</b>
                    <small>Cohorts</small>
                  </div>
                  <div>
                    <b>
                      {
                        data.people.filter(
                          (p) => completedLessons(p).length < 7,
                        ).length
                      }
                    </b>
                    <small>In progress</small>
                  </div>
                </div>
                <section className="cfc-card">
                  <span className="cfc-kicker">NEXT CLASS</span>
                  <h2>{next?.topic || "No upcoming class scheduled"}</h2>
                  {next && (
                    <>
                      <p>
                        {labelDate(next.held_on)} · Class {next.lesson} of 7
                      </p>
                      <p>{next.venue || "Venue to be confirmed"}</p>
                      <button
                        className="cfc-primary"
                        onClick={() => {
                          setSession(next.id);
                          setTab("Classes");
                        }}
                      >
                        Take attendance
                      </button>
                    </>
                  )}
                </section>
                <h2>Needs attention</h2>
                {data.people
                  .filter(
                    (p) =>
                      !p.completed_on &&
                      (p.attendance.some(
                        (a) =>
                          a.status === "absent" &&
                          !completedLessons(p).includes(a.lesson),
                      ) ||
                        completedLessons(p).length === 7),
                  )
                  .slice(0, 5)
                  .map((p) => (
                    <button
                      key={p.id}
                      className="cfc-person-row"
                      onClick={() => {
                        setPerson(p);
                        setTab("Participants");
                      }}
                    >
                      <b>{p.name}</b>
                      <span>
                        {completedLessons(p).length === 7
                          ? "Ready for completion review"
                          : "Outstanding: " +
                            lessons
                              .filter((n) => !completedLessons(p).includes(n))
                              .join(", ")}{" "}
                        →
                      </span>
                    </button>
                  ))}
                {!data.people.length && (
                  <p className="cfc-card">
                    No participants enrolled yet. Create a cohort under Classes,
                    then enrol participants.
                  </p>
                )}
                <button
                  className="cfc-secondary"
                  onClick={() => setTab("Participants")}
                >
                  View all participants →
                </button>
              </>
            )}
            {tab === "Participants" && (
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
                    {attendance(p)}
                    <div className="cfc-actions">
                      <button onClick={() => setPerson(p)}>
                        View progress
                      </button>
                      {p.phone && <a href={"tel:" + p.phone}>Call</a>}
                    </div>
                  </article>
                ))}
                {!visiblePeople.length && <p>No matching participants.</p>}
                {current && (
                  <section
                    className="cfc-detail cfc-card"
                    aria-label="Participant progress"
                  >
                    <button onClick={() => setPerson(null)}>
                      Close details ×
                    </button>
                    <h2>{current.name}</h2>
                    {attendance(current)}
                    <p>
                      {current.completed_on
                        ? "Completed " + labelDate(current.completed_on)
                        : "Outstanding classes: " +
                          (lessons
                            .filter(
                              (n) => !completedLessons(current).includes(n),
                            )
                            .join(", ") || "None — ready for review")}
                    </p>
                    <h3>Make-up opportunities</h3>
                    {data.sessions
                      .filter(
                        (s) =>
                          s.held_on >= today() &&
                          !completedLessons(current).includes(s.lesson),
                      )
                      .map((s) => (
                        <p key={s.id}>
                          Class {s.lesson} · {labelDate(s.held_on)} ·{" "}
                          {data.cohorts.find((c) => c.id === s.cohort_id)?.name}
                          {!current.cohorts.includes(s.cohort_id) ? (
                            data.canOrganize ? (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void save("enrol", {
                                    member: current.id,
                                    cohort: s.cohort_id,
                                  })
                                }
                              >
                                Schedule make-up
                              </button>
                            ) : (
                              <span>
                                {" "}
                                · Ask coordinator to add this participant
                              </span>
                            )
                          ) : (
                            <span> · Enrolled</span>
                          )}
                        </p>
                      ))}
                    <h3>Attendance history</h3>
                    {current.attendance.map((a) => (
                      <p key={a.session_id}>
                        Class {a.lesson} · {a.status} · {labelDate(a.date)} ·{" "}
                        {a.cohort_name || "Earlier cohort"}
                      </p>
                    ))}
                    {certificate(
                      current,
                      current.id,
                      "cfc",
                      current.completed_on,
                    )}
                    {!current.completed_on &&
                      completedLessons(current).length === 7 && (
                        <>
                          <button
                            className="cfc-primary"
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
                  </section>
                )}
              </>
            )}
            {tab === "Classes" && (
              <>
                <h2>Attendance by cohort</h2>
                <p>
                  Choose a cohort above, then select a session to take
                  attendance.
                </p>
                <button
                  className="cfc-secondary"
                  onClick={() => {
                    setCohort("");
                    setTab("Participants");
                  }}
                >
                  Find attendance by participant
                </button>
                <label className="cfc-select">
                  Select a class
                  <select
                    value={session}
                    onChange={(e) => {
                      setSession(e.target.value);
                      setCorrection("");
                    }}
                  >
                    <option value="">Choose class</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        Class {s.lesson} · {labelDate(s.held_on)} · {s.topic}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedSession && (
                  <section className="cfc-card">
                    <h2>{selectedSession.topic}</h2>
                    <p>
                      {labelDate(selectedSession.held_on)} ·{" "}
                      {selectedSession.venue}
                    </p>
                    {selectedSession.held_on > today() && (
                      <p>Attendance opens on the class date.</p>
                    )}
                    <label>
                      Correction reason (only when changing a saved mark)
                      <input
                        value={correction}
                        onChange={(e) => setCorrection(e.target.value)}
                        maxLength={1000}
                      />
                    </label>
                    <label>
                      Find participant in this session
                      <input
                        value={attendanceSearch}
                        onChange={(e) => setAttendanceSearch(e.target.value)}
                        placeholder="Name or phone number"
                      />
                    </label>
                    {data.people
                      .filter(
                        (p) =>
                          p.cohorts.includes(selectedSession.cohort_id) &&
                          matchesPerson(p, attendanceSearch),
                      )
                      .map((p) => (
                        <div className="cfc-attendance-row" key={p.id}>
                          <b>{p.name}</b>
                          <small>
                            {p.attendance.find((a) => a.session_id === session)
                              ?.status || "Not marked"}
                          </small>
                          <div className="cfc-actions">
                            {["present", "absent"].map((status) => (
                              <button
                                key={status}
                                aria-pressed={p.attendance.some(
                                  (a) =>
                                    a.session_id === session &&
                                    a.status === status,
                                )}
                                disabled={
                                  busy ||
                                  selectedSession.held_on > today() ||
                                  !!p.completed_on
                                }
                                onClick={() =>
                                  void save("attendance", {
                                    member: p.id,
                                    session,
                                    status,
                                    note: correction,
                                  })
                                }
                              >
                                {status === "present" ? "Present" : "Absent"}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                  </section>
                )}
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
                        setTab("Participants");
                        setAdding(true);
                      }}
                    >
                      Add participant or arrange a make-up
                    </button>
                  </>
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
                  .map((p) => (
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
                              <input
                                type="hidden"
                                name="member"
                                value={p.member_id}
                              />
                              <label>
                                Schedule baptism
                                <input
                                  type="date"
                                  name="date"
                                  required
                                  min={today()}
                                />
                              </label>
                            </>,
                          )}
                          {form(
                            "baptism_complete",
                            <>
                              <input
                                type="hidden"
                                name="member"
                                value={p.member_id}
                              />
                              <label>
                                Actual baptism date
                                <input
                                  type="date"
                                  name="date"
                                  required
                                  max={today()}
                                />
                              </label>
                            </>,
                          )}
                        </>
                      )}
                      {certificate(p, p.member_id, "baptism", p.baptised_on)}
                    </article>
                  ))}
              </>
            )}
            {tab === "Account" && (
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
            )}
          </>
        )}
      </div>
      <nav className="cfc-bottom" aria-label="CFC dashboard">
        {["Today", "Participants", "Classes", "Baptism", "Account"].map(
          (name, i) => (
            <button
              key={name}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => {
                setTab(name);
                setAdding(false);
                setSearch("");
                setMemberSearch("");
                setMatches([]);
                setPerson(null);
              }}
            >
              <span aria-hidden="true">{["⌂", "♧", "▤", "◇", "○"][i]}</span>
              {name}
            </button>
          ),
        )}
      </nav>
    </main>
  );
}
