"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  visitPurposes,
  type JourneyDetail,
  type JourneySnapshot,
  type JourneyPerson,
  type JourneyReport,
} from "@/lib/journey/model";
const d = (v: string | null | undefined) =>
  v
    ? new Intl.DateTimeFormat("en-NG", {
        timeZone: "Africa/Lagos",
        dateStyle: "medium",
      }).format(new Date(v.length === 10 ? v + "T12:00:00Z" : v))
    : "Not recorded";
export function DirectRegistrationFields() {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<JourneyPerson[]>([]),
    [existing, setExisting] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [identity, setIdentity] = useState(false),
    [undated, setUndated] = useState(false),
    [draft, setDraft] = useState({
      first: "",
      last: "",
      phone: "",
      email: "",
      occupation: "",
      address: "",
      gender: "",
      birthdayMonth: "",
      birthdayDay: "",
      anniversaryMonth: "",
      anniversaryDay: "",
      contactConsent: true,
      emailOptIn: true,
      smsOptIn: true,
    });
  async function search() {
    setLoading(true);
    setMessage("");
    try {
      const r = await fetch(
        "/api/journey?search=" + encodeURIComponent(query.trim()),
        { cache: "no-store", signal: AbortSignal.timeout(20000) },
      );
      const x = await r.json();
      if (!r.ok) throw Error(x.message);
      setResults(x.items || []);
      if (!x.items?.length)
        setMessage(
          "No matching current record found. You can register a new person below.",
        );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Search unavailable");
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="vj-wide vj-direct-search">
        <h3>1. Check for an existing person</h3>
        <p>
          Search by name first. Matching email or phone numbers cannot create a
          duplicate.
        </p>
        <div>
          <input
            aria-label="Find an existing person"
            placeholder="Name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="vj-secondary"
            onClick={() => void search()}
            disabled={loading || query.trim().length < 2}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
        {message && <p role="status">{message}</p>}
      </div>
      <label className="vj-wide">
        Existing person or new registration
        <select
          aria-label="Existing person or new registration"
          name="existingId"
          value={existing}
          onChange={(e) => {
            setExisting(e.target.value);
            setIdentity(false);
          }}
        >
          <option value="">Register a new person</option>
          {results.map((p) => (
            <option key={p.member_id} value={p.member_id}>
              {p.name} · {p.phone || p.email || "Contact restricted"} ·{" "}
              {p.status}
            </option>
          ))}
        </select>
      </label>
      {existing ? (
        <label className="vj-wide vj-check">
          <input
            type="checkbox"
            name="identityConfirmed"
            checked={identity}
            onChange={(e) => setIdentity(e.target.checked)}
            value="true"
            required
          />
          I checked the identity and this is the same person.
        </label>
      ) : (
        <>
          <h3 className="vj-wide">2. Personal details</h3>
          <label>
            Other names
            <input
              name="first"
              value={draft.first}
              onChange={(e) => setDraft({ ...draft, first: e.target.value })}
              required
              maxLength={120}
            />
          </label>
          <label>
            Surname
            <input
              name="last"
              value={draft.last}
              onChange={(e) => setDraft({ ...draft, last: e.target.value })}
              required
              maxLength={100}
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              name="phone"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              maxLength={50}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              name="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              maxLength={254}
            />
          </label>
          <label>
            Gender · optional
            <select
              name="gender"
              value={draft.gender}
              onChange={(e) => setDraft({ ...draft, gender: e.target.value })}
            >
              <option value="">Not provided</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </label>
          {(
            [
              ["birthdayMonth", "Birthday month", 12],
              ["birthdayDay", "Birthday day", 31],
              ["anniversaryMonth", "Wedding anniversary month", 12],
              ["anniversaryDay", "Wedding anniversary day", 31],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key}>
              {label} · optional
              <input
                type="number"
                name={key}
                min={1}
                max={max}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </label>
          ))}
          <label>
            Occupation · optional
            <input
              name="occupation"
              value={draft.occupation}
              onChange={(e) =>
                setDraft({ ...draft, occupation: e.target.value })
              }
              maxLength={150}
            />
          </label>
          <label>
            Address · optional
            <input
              name="address"
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              maxLength={600}
            />
          </label>
          <label className="vj-check">
            <input
              type="checkbox"
              name="contactConsent"
              value="true"
              checked={draft.contactConsent}
              onChange={(e) =>
                setDraft({ ...draft, contactConsent: e.target.checked })
              }
            />
            Contact permission
          </label>
          <label className="vj-check">
            <input
              type="checkbox"
              name="emailOptIn"
              value="true"
              checked={draft.emailOptIn}
              onChange={(e) =>
                setDraft({ ...draft, emailOptIn: e.target.checked })
              }
            />
            Email when an address exists
          </label>
          <label className="vj-check">
            <input
              type="checkbox"
              name="smsOptIn"
              value="true"
              checked={draft.smsOptIn}
              onChange={(e) =>
                setDraft({ ...draft, smsOptIn: e.target.checked })
              }
            />
            SMS
          </label>
        </>
      )}
      <h3 className="vj-wide">3. Known previous visit · optional</h3>
      <label className="vj-wide vj-check">
        <input
          type="checkbox"
          name="previousVisitConfirmed"
          value="true"
          checked={undated}
          onChange={(e) => setUndated(e.target.checked)}
        />
        A previous VBC visit is known, but its exact date is unknown.
      </label>
      <label>
        Known to have visited before · not the visit date
        <input
          type="date"
          name="beforeDate"
          disabled={!undated}
          defaultValue={new Date().toLocaleDateString("en-CA", {
            timeZone: "Africa/Lagos",
          })}
        />
      </label>
      <label>
        Actual VBC church visit date
        <input name="previousVisitDate" type="date" disabled={undated} />
      </label>
      <label>
        How the previous visit is known
        <input
          name="visitEvidence"
          maxLength={2000}
          placeholder="For example, visitor reported by phone"
        />
      </label>
      <label className="vj-wide">
        Registration source / evidence
        <textarea
          name="note"
          required
          minLength={5}
          maxLength={2000}
          rows={3}
        />
      </label>
      <p className="vj-hint vj-wide">
        Registration is allowed without a first-timer form or a known visit
        date. Leave unknown attendance blank. Official joining is a separate
        Coordinator action after one previous VBC visit; the first-time same-day
        exception is still unconfirmed. Existing records keep their contact
        preferences.
      </p>
    </>
  );
}
export function IntegrationProfile({
  detail,
  snapshot,
  own,
  action,
  section = "integration",
}: {
  detail: JourneyDetail;
  snapshot: JourneySnapshot;
  own: boolean;
  action: (name: string) => void;
  section?: string;
}) {
  const coordinator = snapshot.capabilities.coordinator;
  const ministries = detail.ministry || [],
    cells = detail.home_cells || [],
    welfare = detail.welfare || [];
  return (
    <div className="vj-track-grid">
      {(section === "integration" || section === "ministry") && (
        <section className="vj-panel vj-track">
          <span className="vj-eyebrow">MINISTRY & ACTIVITY TEAMS</span>
          <h2>Serving and belonging</h2>
          <p>
            Ministry involvement supports integration. It is not a membership
            condition.
          </p>
          {ministries.length ? (
            ministries.map((x) => (
              <article key={x.id} className="vj-integration-row">
                <strong>{x.team_name}</strong>
                <span
                  className={"vj-badge " + (x.active ? "green" : "neutral")}
                >
                  {x.active ? "Active" : "Ended"}
                </span>
                <p>{x.responsibility || "Responsibility not recorded"}</p>
                <small>
                  Joined: {d(x.joined_on)}
                  {x.left_on ? " · Left: " + d(x.left_on) : ""}
                </small>
              </article>
            ))
          ) : (
            <p className="vj-hint">
              No ministry involvement has been recorded.
            </p>
          )}
          {coordinator && (
            <div className="vj-actions">
              <button
                className="vj-primary"
                onClick={() => action("ministry_add")}
              >
                Add ministry team
              </button>
              {ministries.some((x) => x.active) && (
                <button
                  className="vj-secondary"
                  onClick={() => action("ministry_end")}
                >
                  End an assignment
                </button>
              )}
            </div>
          )}
        </section>
      )}
      {(section === "integration" || section === "home_cells") && (
        <section className="vj-panel vj-track">
          <span className="vj-eyebrow">EXISTING HOME CELL OFFICE</span>
          <h2>Home Cell participation</h2>
          {cells.length ? (
            cells.map((x) => (
              <article className="vj-integration-row" key={x.id}>
                <strong>{x.cell_name}</strong>
                <span
                  className={"vj-badge " + (x.active ? "green" : "neutral")}
                >
                  {x.active ? "Current" : "Previous"}
                </span>
                <p>{x.area_name}</p>
                <small>
                  Assigned: {d(x.joined_at)}
                  {x.left_at ? " · Left: " + d(x.left_at) : ""}
                </small>
              </article>
            ))
          ) : (
            <p className="vj-hint">
              No Home Cell assignment is recorded. This does not prove
              non-participation.
            </p>
          )}
          {(detail.home_transfers || []).map((t) => (
            <div className="vj-integration-row" key={t.id}>
              <strong>Transfer · {t.status}</strong>
              <p>{t.reason}</p>
              <small>
                {d(t.requested_at)}
                {t.decision_reason ? " · " + t.decision_reason : ""}
              </small>
            </div>
          ))}
          <p className="vj-hint">
            Assignments and transfers stay in Home Cell Office, using its
            existing access and conflict-resolution rules.
          </p>
          <a className="vj-secondary" href="/home-cell/members">
            Open Home Cell Office ↗
          </a>
        </section>
      )}
      {section === "care" && own && (
        <section className="vj-panel vj-track">
          <span className="vj-eyebrow">PRIVATE CARE JOURNAL</span>
          <h2>Welfare and support needs</h2>
          <p>
            Visible to the assigned friend and Follow Through Coordinator. These
            notes are excluded from the standard spreadsheet export.
          </p>
          {welfare.map((x) => (
            <article key={x.id} className="vj-integration-row">
              <p>{x.note}</p>
              <small>{d(x.created_at)}</small>
            </article>
          ))}
          <button className="vj-secondary" onClick={() => action("support")}>
            Record support need
          </button>
        </section>
      )}
    </div>
  );
}
const metricLabels: Record<string, string> = {
  new_visitors: "New visitor intake records",
  visitors_contacted: "New visitor cohort contacted",
  first_contact_within_48h: "First successful contact within 48h",
  awaiting_assignment_now: "Awaiting assignment · now",
  overdue_followups_now: "Overdue Follow Through · now",
  interested_now: "Interested in joining · now",
  official_joiners: "Official joiners in period",
  direct_joiners: "Direct joiners in period",
  visitor_cohort_joiners: "Visitor cohort joined by period end",
  conversion_rate: "Visitor cohort conversion (%)",
  continuing_care_now: "Continuing care · now",
  cfc_enrolled_now: "CFC enrolled · now",
  cfc_enrolments_in_period: "CFC enrolments in period",
  certificate_awards_in_period: "Certificate awards in period",
  cfc_enrolments_recorded_in_period: "CFC enrolments recorded in period",
  certificate_records_in_period: "Certificates recorded in period",
  ministry_members_by_period_end: "Ministry members by period end",
  home_cell_members_by_period_end: "Home Cell members by period end",
  cfc_completions: "CFC completions in period",
  ministry_involvement_now: "Ministry involvement · now",
  home_cell_assignment_now: "Assigned to Home Cells · now",
  unknown_intake_source: "Unknown intake source in cohort",
  unknown_first_visit: "Unknown first visit in cohort",
};
export function JourneyReports({
  snapshot,
  onPerson,
}: {
  snapshot: JourneySnapshot;
  onPerson: (id: string) => void;
}) {
  const day = new Date(),
    today = day.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }),
    year = Number(today.slice(0, 4)),
    month = Number(today.slice(5, 7));
  const [kind, setKind] = useState("month"),
    [period, setPeriod] = useState(today.slice(0, 7)),
    [quarter, setQuarter] = useState(String(Math.ceil(month / 3))),
    [reportYear, setReportYear] = useState(String(year)),
    [from, setFrom] = useState(`${year}-${String(month).padStart(2, "0")}-01`),
    [to, setTo] = useState(today),
    [worker, setWorker] = useState(""),
    [page, setPage] = useState(0),
    [data, setData] = useState<JourneyReport | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [downloading, setDownloading] = useState(false),
    [loadedWorker, setLoadedWorker] = useState(""),
    [allMetrics, setAllMetrics] = useState(false);
  function dates() {
    if (kind === "custom") return { from, to };
    if (kind === "month") {
      const [y, m] = period.split("-").map(Number);
      return {
        from: period + "-01",
        to:
          new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) > today
            ? today
            : new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
      };
    }
    const y = Number(reportYear),
      m = kind === "quarter" ? (Number(quarter) - 1) * 3 : 0;
    return {
      from: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
      to: [
        new Date(Date.UTC(y, kind === "quarter" ? m + 3 : 12, 0))
          .toISOString()
          .slice(0, 10),
        today,
      ].sort()[0],
    };
  }
  async function load(n = 0) {
    setLoading(true);
    setError("");
    try {
      const range = dates(),
        p = new URLSearchParams({ ...range, worker, page: String(n) });
      const r = await fetch("/api/journey/report?" + p, {
          cache: "no-store",
          signal: AbortSignal.timeout(25000),
        }),
        value = await r.json();
      if (!r.ok) throw Error(value.message);
      setData(value);
      setLoadedWorker(worker);
      setPage(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report unavailable");
    } finally {
      setLoading(false);
    }
  }
  async function download(format: string) {
    setDownloading(true);
    setError("");
    try {
      const r = await fetch(
        "/api/journey/report?" +
          new URLSearchParams({
            from: data!.from,
            to: data!.to,
            worker: loadedWorker,
            format,
          }),
        { cache: "no-store", signal: AbortSignal.timeout(90000) },
      );
      if (!r.ok) {
        const x = await r.json();
        throw Error(x.message);
      }
      const blob = await r.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `VBC_Member_Care_${dates().from}_${dates().to}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export unavailable");
    } finally {
      setDownloading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="vj-reports">
      <form
        className="vj-panel vj-report-controls"
        onSubmit={(e) => {
          e.preventDefault();
          void load(0);
        }}
      >
        <label>
          Period
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="month">Monthly</option>
            <option value="quarter">Quarterly</option>
            <option value="year">Annual</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        {kind === "month" ? (
          <label>
            Month
            <input
              type="month"
              required
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </label>
        ) : kind === "custom" ? (
          <>
            <label>
              From
              <input
                type="date"
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                required
                max={today}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Year
              <input
                type="number"
                required
                min="1900"
                max={year}
                value={reportYear}
                onChange={(e) => setReportYear(e.target.value)}
              />
            </label>
            {kind === "quarter" && (
              <label>
                Quarter
                <select
                  value={quarter}
                  onChange={(e) => setQuarter(e.target.value)}
                >
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>
                      Quarter {q}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        {snapshot.capabilities.coordinator && (
          <label>
            Current assigned friend
            <select value={worker} onChange={(e) => setWorker(e.target.value)}>
              <option value="">All accessible people</option>
              {snapshot.team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="vj-primary" disabled={loading}>
          Update report
        </button>
      </form>
      {error && (
        <div className="vj-error" role="alert">
          {error}
        </div>
      )}
      {data && (
        <>
          <div className="vj-report-title">
            <div>
              <h2>
                {d(data.from)} – {d(data.to)}
              </h2>
              <p>
                Current assignment filter. Historical period measures and
                current operational snapshots are labelled separately.
              </p>
            </div>
            <div className="vj-actions">
              <button
                className="vj-secondary"
                disabled={
                  downloading ||
                  loading ||
                  (!!data &&
                    (dates().from !== data.from ||
                      dates().to !== data.to ||
                      worker !== loadedWorker))
                }
                onClick={() => void download("csv")}
              >
                Download CSV
              </button>
              <button
                className="vj-primary"
                disabled={
                  downloading ||
                  loading ||
                  (!!data &&
                    (dates().from !== data.from ||
                      dates().to !== data.to ||
                      worker !== loadedWorker))
                }
                onClick={() => void download("xlsx")}
              >
                {downloading ? "Preparing…" : "Download Excel"}
              </button>
            </div>
          </div>
          <div className="vj-report-metrics">
            {Object.entries(data.scoreboard)
              .filter(
                ([key]) =>
                  allMetrics ||
                  [
                    "new_visitors",
                    "official_joiners",
                    "conversion_rate",
                    "overdue_followups_now",
                    "continuing_care_now",
                    "cfc_enrolled_now",
                  ].includes(key),
              )
              .map(([key, value]) => (
                <article className="vj-panel" key={key}>
                  <span>{metricLabels[key] || key}</span>
                  <strong>
                    {value == null
                      ? "—"
                      : key === "conversion_rate"
                        ? value + "%"
                        : value}
                  </strong>
                </article>
              ))}
          </div>
          <button
            className="vj-secondary"
            onClick={() => setAllMetrics((v) => !v)}
          >
            {allMetrics ? "Show key figures only" : "Show all report figures"}
          </button>
          {data.friend_summary && (
            <section className="vj-panel">
              <div className="vj-panel-head">
                <div>
                  <h2>Follow Through Friends analysis</h2>
                  <p>
                    All people in this report, grouped by their current assigned
                    Friend. These totals include every page.
                  </p>
                </div>
              </div>
              <div className="vj-register-wrap">
                <table className="vj-register-table">
                  <thead>
                    <tr>
                      {[
                        "Assigned Friend",
                        "People in report",
                        "Joined by period end",
                        "Contact attempts",
                        "Conversations",
                        "Overdue now",
                        "CFC enrolled now",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.friend_summary.map((r, i) => (
                      <tr key={String(r.assigned_to) || i}>
                        {[
                          "friend",
                          "people",
                          "joined_by_period_end",
                          "contact_attempts",
                          "conversations",
                          "overdue_now",
                          "cfc_enrolled_now",
                        ].map((k, j) => (
                          <td
                            key={k}
                            data-label={
                              [
                                "Assigned Friend",
                                "People in report",
                                "Joined by period end",
                                "Contact attempts",
                                "Conversations",
                                "Overdue now",
                                "CFC enrolled now",
                              ][j]
                            }
                          >
                            {String(r[k] ?? "Not recorded")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <details className="vj-panel vj-report-definitions">
            <summary>How these figures are calculated</summary>
            {Object.entries(data.definitions).map(([key, value]) => (
              <p key={key}>{value}</p>
            ))}
          </details>
          <section className="vj-panel">
            <div className="vj-panel-head">
              <h2>People included in this period</h2>
              <small>{data.total} accessible people</small>
            </div>
            {data.rows.map((r, i) => (
              <button
                className="vj-person-row vj-report-person"
                key={String(r.member_id) || i}
                disabled={!!r.archived_at}
                onClick={() => onPerson(String(r.member_id))}
              >
                <strong>{String(r.name)}</strong>
                <span>
                  {String(r.registration_source).replaceAll("_", " ")}
                </span>
                <span>
                  {r.joined_by_period_end
                    ? "Joined " + d(String(r.joined_by_period_end))
                    : r.legacy_member
                      ? "Official member · actual joining date unknown"
                      : "Official joining not recorded by period end"}
                </span>
                <span>
                  {r.archived_at
                    ? "Archived · retained in reporting"
                    : "Open journey →"}
                </span>
              </button>
            ))}
            {!data.rows.length && (
              <div className="vj-empty">
                No accessible people match this reporting period.
              </div>
            )}
            <div className="vj-pagination">
              <span>
                {data.total === 0 ? 0 : page * 30 + 1}–
                {Math.min((page + 1) * 30, data.total)} of {data.total}
              </span>
              <div>
                <button
                  className="vj-secondary"
                  disabled={!page || loading}
                  onClick={() => void load(page - 1)}
                >
                  Previous
                </button>
                <button
                  className="vj-secondary"
                  disabled={(page + 1) * 30 >= data.total || loading}
                  onClick={() => void load(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
