"use client";
import type { JourneyPerson } from "@/lib/journey/model";
const date = (v: string | null | undefined) =>
  v
    ? new Date(v.length === 10 ? v + "T12:00:00Z" : v).toLocaleDateString(
        "en-GB",
        {
          timeZone: "Africa/Lagos",
          day: "numeric",
          month: "short",
          year: "numeric",
        },
      )
    : "Not recorded";
export default function JourneyRegister({
  people,
  classes = false,
  onPerson,
}: {
  people: JourneyPerson[];
  classes?: boolean;
  onPerson: (id: string) => void;
}) {
  return (
    <div className="vj-register-wrap">
      <p className="vj-hint vj-register-help">
        {classes
          ? "P = present · A = absent · — = no record. Select a name to enrol, record a week or assess completion."
          : "Date on board is the saved registration date. Joined church means official joining is confirmed, not just eligibility. Select a name to record contact, attendance or membership."}
      </p>
      <table
        className={"vj-register-table " + (classes ? "vj-class-register" : "")}
      >
        <thead>
          <tr>
            {(classes
              ? [
                  "Name",
                  "Official joining",
                  "Cohort",
                  ...Array.from({ length: 7 }, (_, i) => "W" + (i + 1)),
                  "Completion / certificate",
                ]
              : [
                  "Date on board",
                  "Name",
                  "Sex",
                  "Phone number",
                  "Joined church?",
                  "Assigned Friend",
                  "Next contact",
                ]
            ).map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.member_id}>
              {!classes && (
                <td data-label="Date on board">
                  {date(p.date_on_board || p.registered_at)}
                </td>
              )}
              <td data-label="Name">
                <button
                  className="vj-register-name"
                  onClick={() => onPerson(p.member_id)}
                >
                  {p.name}
                </button>
              </td>
              {classes ? (
                <>
                  <td data-label="Official joining">
                    {date(p.official_joined_on)}
                  </td>
                  <td data-label="Cohort">{p.cfc_cohort || "Not enrolled"}</td>
                  {Array.from({ length: 7 }, (_, i) => {
                    const entry = p.cfc_weeks?.find((x) => x.week === i + 1);
                    return (
                      <td key={i} data-label={"Week " + (i + 1)}>
                        <span
                          className={
                            "vj-week-cell " +
                            (entry
                              ? entry.status === "absent"
                                ? "absent"
                                : "present"
                              : "unknown")
                          }
                          title={
                            entry ? date(entry.date) : "No attendance recorded"
                          }
                        >
                          {entry
                            ? entry.status === "absent"
                              ? "A"
                              : "P"
                            : "—"}
                        </span>
                      </td>
                    );
                  })}
                  <td data-label="Completion / certificate">
                    {p.cfc_completed_on
                      ? "Completed " + date(p.cfc_completed_on)
                      : "Not completed"}
                    {p.certificate_number && (
                      <small>Certificate: {p.certificate_number}</small>
                    )}
                  </td>
                </>
              ) : (
                <>
                  <td data-label="Sex">{p.gender || "Not recorded"}</td>
                  <td data-label="Phone number">
                    {p.phone || "Not available"}
                  </td>
                  <td data-label="Joined church?">
                    {p.official_joined_on
                      ? "Yes · " + date(p.official_joined_on)
                      : p.legacy_member
                        ? "Yes · date unknown"
                        : "Not confirmed"}
                  </td>
                  <td data-label="Assigned Friend">
                    {p.worker_name || "Not assigned"}
                  </td>
                  <td data-label="Next contact">
                    {date(p.next_due)}
                    <small>{p.followup_state.replaceAll("_", " ")}</small>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!people.length && (
        <div className="vj-empty">No people match this view.</div>
      )}
    </div>
  );
}
