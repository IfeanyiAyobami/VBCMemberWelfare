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
type Person = {
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
      await load(search);
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
        <button disabled={busy}>Save</button>
      </form>
    );
  }
  const current = data?.people.find((p) => p.id === person?.id) || person;
  const visiblePeople = (data?.people || []).filter(
    (p) =>
      (!cohort || p.cohorts.includes(cohort)) &&
      p.name.toLowerCase().includes(search.toLowerCase()) &&
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
            {tab !== "Account" && (
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
                    No participants enrolled yet. Create a cohort under Classes, then enrol participants.
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
                <form
                  className="cfc-search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void load(search).catch((e) => setError(e.message));
                  }}
                >
                  <input
                    aria-label="Search participants"
                    placeholder="Search by name"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <button>Search</button>
                </form>
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
                    {data.people
                      .filter((p) =>
                        p.cohorts.includes(selectedSession.cohort_id),
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
                    <h2>Enrol / arrange a make-up</h2>
                    <form
                      className="cfc-search"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void load(search).catch((e) => setError(e.message));
                      }}
                    >
                      <input
                        aria-label="Search members to enrol"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search officially joined member"
                      />
                      <button>Find</button>
                    </form>
                    {form(
                      "enrol",
                      <>
                        <label>
                          Participant
                          <select name="member" required>
                            <option value="">Search and choose a member</option>
                            {data.candidates.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Cohort
                          <select name="cohort" required>
                            <option value="">Choose cohort</option>
                            {cohortOptions()}
                          </select>
                        </label>
                      </>,
                    )}
                  </>
                )}
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
        {["Today", "Participants", "Classes", "Account"].map((name, i) => (
          <button
            key={name}
            aria-current={tab === name ? "page" : undefined}
            onClick={() => {
              setTab(name);
              setPerson(null);
            }}
          >
            <span aria-hidden="true">{["⌂", "♧", "▤", "○"][i]}</span>
            {name}
          </button>
        ))}
      </nav>
    </main>
  );
}
