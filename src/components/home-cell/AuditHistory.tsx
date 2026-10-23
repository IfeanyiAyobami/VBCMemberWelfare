"use client";
import { useEffect, useState } from "react";
type Event = {
  id: number;
  action: string;
  created_at: string;
  details: {
    reason?: string;
    before?: {
      meeting?: { version: number; status: string; notes: string };
      attendance?: { status: string }[];
    };
    after?: {
      version?: number;
      status?: string;
      notes?: string;
      kind?: string;
      amount?: number;
      description?: string;
      role?: string;
    };
  };
};
export default function AuditHistory({
  meeting,
  scope,
  revision = 0,
  onError,
}: {
  meeting?: string;
  scope?: string;
  revision?: number;
  onError?: (message: string) => void;
}) {
  const [items, setItems] = useState<Event[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);
  useEffect(() => {
    let active = true;
    setError("");
    void fetch(
      "/api/home-cell/audit?" +
        new URLSearchParams({
          ...(meeting ? { meeting } : {}),
          ...(scope ? { scope } : {}),
        }),
      { cache: "no-store" },
    )
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Error(j.message);
        if (active) setItems(j.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [meeting, scope, revision]);
  return (
    <section className="hc-panel">
      <header>
        <h2>
          {meeting ? "Report Revision History" : "Leadership Audit History"}
        </h2>
      </header>
      {error && !onError && (
        <p role="alert" className="hc-alert">
          {error}
        </p>
      )}
      {error && onError && (
        <p className="hc-muted">
          Activity log unavailable. Reopen this tab to retry.
        </p>
      )}
      {!items.length && !error && (
        <p className="hc-muted">No recorded history yet.</p>
      )}
      {items.map((e) => (
        <details key={e.id} className="hc-audit-event">
          <summary>
            {e.action.replace("workspace_", "").replaceAll("_", " ")}{" "}
            <small>
              {new Date(e.created_at).toLocaleString("en-NG", {
                timeZone: "Africa/Lagos",
              })}
            </small>
          </summary>
          <div>
            {e.details.reason && <p>{e.details.reason}</p>}
            {e.details.before?.meeting && (
              <p>
                <b>Before:</b> version {e.details.before.meeting.version} ·{" "}
                {e.details.before.meeting.status.replaceAll("_", " ")}
                <br />
                {e.details.before.meeting.notes}
              </p>
            )}
            {e.details.after && (
              <p>
                <b>Saved:</b>{" "}
                {[
                  e.details.after.version
                    ? "version " + e.details.after.version
                    : "",
                  e.details.after.status,
                  e.details.after.kind,
                  e.details.after.amount ? "NGN " + e.details.after.amount : "",
                  e.details.after.description,
                  e.details.after.role,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                <br />
                {e.details.after.notes}
              </p>
            )}
          </div>
        </details>
      ))}
      {items.length >= 250 && (
        <p className="hc-muted">Showing the most recent 250 events.</p>
      )}
    </section>
  );
}
