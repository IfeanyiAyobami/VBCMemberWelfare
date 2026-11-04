"use client";
import { useEffect, useRef, useState } from "react";
import { readIntakeCSV, type Intake } from "@/lib/journey/intake";
type Row = {
  line: number;
  data: Intake;
  error: string;
  requestId: string;
  saved?: boolean;
  message?: string;
};
export default function JourneyImport({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const stop = useRef(false),
    dialog = useRef<HTMLDialogElement>(null),
    [rows, setRows] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    return () => before?.focus();
  }, []);
  function template() {
    const b = new Blob(
      [
        "first,last,phone,email,contact_consent,email_opt_in,sms_opt_in,previous_visit_date,visit_evidence,note,birthday_month,birthday_day,anniversary_month,anniversary_day\r\n",
      ],
      { type: "text/csv" },
    );
    const url = URL.createObjectURL(b),
      a = document.createElement("a");
    a.href = url;
    a.download = "Follow_Through_Registration_Template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function save() {
    stop.current = false;
    setBusy(true);
    setError("");
    let current = [...rows];
    try {
      const pending = current.filter((r) => !r.error && !r.saved);
      for (let start = 0; start < pending.length; start += 10) {
        const batch = pending.slice(start, start + 10);
        const r = await fetch("/api/journey/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: batch.map(({ requestId, data }) => ({ requestId, data })),
          }),
          signal: AbortSignal.timeout(60000),
        });
        const x = await r.json();
        if (!r.ok) throw Error(x.message);
        for (const result of x.results) {
          current = current.map((v) =>
            v.requestId === result.requestId
              ? { ...v, saved: result.saved, message: result.message }
              : v,
          );
        }
        setRows(current);
        if (stop.current) break;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import interrupted.");
    } finally {
      setBusy(false);
    }
  }
  const ready = rows.filter((r) => !r.error && !r.saved).length,
    saved = rows.filter((r) => r.saved).length;
  return (
    <dialog
      ref={dialog}
      className="vj-dialog vj-import-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="journey-import-title"
    >
      <header className="vj-dialog-head">
        <div>
          <span className="vj-eyebrow">Follow Through</span>
          <h2 id="journey-import-title">Register from CSV</h2>
        </div>
        <button
          className="vj-icon"
          disabled={busy}
          onClick={onClose}
          aria-label="Close import"
        >
          ×
        </button>
      </header>
      <div className="vj-dialog-body">
        <p>
          Upload, review, then save. New records created by a Friend are
          assigned to that Friend. Existing people are never overwritten or
          reassigned by this import.
        </p>
        <div className="vj-actions">
          <button className="vj-secondary" onClick={template}>
            Download CSV template
          </button>
          <label>
            Choose CSV · up to 500 rows, 1 MB
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setError("");
                try {
                  if (f.size > 1048576)
                    throw Error("Choose a file of 1 MB or less.");
                  setRows(
                    readIntakeCSV(await f.text()).map((r) => ({
                      ...r,
                      requestId: crypto.randomUUID(),
                    })),
                  );
                } catch (x) {
                  setRows([]);
                  setError(
                    x instanceof Error ? x.message : "Could not read CSV.",
                  );
                }
              }}
            />
          </label>
        </div>
        <p className="vj-hint">
          Use full dates with years (YYYY-MM-DD). Registration does not confirm
          official membership. Blank contact choices use the existing ON
          defaults. Enter false to opt out.
        </p>
        {rows.length > 0 && (
          <>
            <p role="status">
              {rows.length} rows · {saved} saved ·{" "}
              {rows.filter((r) => r.error).length} need correction
            </p>
            <div className="vj-import-scroll">
              <table className="vj-import-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.requestId}>
                      <td>{r.line}</td>
                      <td>
                        {r.data.first} {r.data.last}
                        <small className="vj-import-mobile-contact">
                          {r.data.phone || r.data.email}
                        </small>
                      </td>
                      <td>{r.data.phone || r.data.email}</td>
                      <td>
                        {r.saved
                          ? "Saved"
                          : r.error || r.message || "Ready to save"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {error && (
          <div className="vj-error" role="alert">
            {error} Successful rows remain saved. Retry here to check unfinished
            rows safely.
          </div>
        )}
        <p className="vj-hint">
          Keep this preview open if interrupted. After a partial import, correct
          only unsaved rows in your CSV. A phone/email conflict needs an
          identity review.
        </p>
        <div className="vj-dialog-actions">
          {busy ? (
            <button
              className="vj-secondary"
              onClick={() => {
                stop.current = true;
              }}
            >
              Stop after current batch
            </button>
          ) : (
            <button className="vj-secondary" onClick={onClose}>
              Close
            </button>
          )}
          <button
            className="vj-primary"
            disabled={busy || !ready}
            onClick={() => void save()}
          >
            {busy ? "Saving reviewed rows…" : `Save / retry ${ready} rows`}
          </button>
        </div>
      </div>
    </dialog>
  );
}
