"use client";
import { useEffect, useState, useRef } from "react";
type Row = {
  row: number;
  name: string;
  phone: string | null;
  gender: string | null;
  source: Record<string, string>;
  memberId: string | null;
};
export default function HistoricalGuests() {
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [messages, setMessages] = useState<Record<number, string>>({});
  const stop = useRef(false);
  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/journey/historical", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.message);
      setRows(d.rows);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(list: Row[]) {
    setBusy(true);
    stop.current = false;
    try {
      for (const row of list) {
        if (stop.current) break;
        const r = await fetch("/api/journey/historical", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ row: row.row }),
        });
        const d = await r.json();
        if (!r.ok) throw Error(d.message);
        setMessages((v) => ({ ...v, [row.row]: d.message }));
        if (d.saved)
          setRows((v) =>
            v.map((x) =>
              x.row === row.row ? { ...x, memberId: d.memberId } : x,
            ),
          );
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to confirm import. Retry safely.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      style={{
        maxWidth: 1200,
        margin: "auto",
        padding: 24,
        color: "var(--text, #f5f4ff)",
      }}
    >
      <a href="/followups">← Follow Through dashboard</a>
      <h1>Historical guest import</h1>
      <p>
        SPRING GUESTS 2025 · Original workbook details retained. New records
        start with care paused. Joining dates, attendance and Friend identities
        are not guessed.
      </p>
      <p>
        After import, find people in People register. Confirm current details,
        assign the right Friend and activate care when appropriate. “Joined
        church: Yes” remains historical evidence until membership is confirmed.
      </p>
      {error && (
        <div
          role="alert"
          style={{ padding: 16, border: "1px solid #ed334f", marginBottom: 16 }}
        >
          {error}
        </div>
      )}
      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}
      >
        <button disabled={busy} onClick={() => void load()}>
          Refresh saved status
        </button>
        <button
          disabled={busy || loading || !rows.some((r) => !r.memberId)}
          onClick={() => void save(rows.filter((r) => !r.memberId))}
        >
          Import remaining guests
        </button>
        {busy && (
          <button
            onClick={() => {
              stop.current = true;
            }}
          >
            Stop after current row
          </button>
        )}
      </div>
      <p role="status">
        {loading
          ? "Loading…"
          : `${rows.filter((r) => r.memberId).length} of ${rows.length} imported`}
      </p>
      {rows.map((r) => (
        <article
          key={r.row}
          style={{
            padding: 18,
            border: "1px solid #7777aa",
            borderRadius: 12,
            marginBottom: 12,
          }}
        >
          <h2 style={{ fontSize: 20, margin: 0 }}>{r.name}</h2>
          <p>
            Row {r.row} · {r.gender || "Gender not recorded"} ·{" "}
            {r.phone || "Phone needs review / not recorded"}
          </p>
          <p>
            Date on board: {r.source.date || "Not recorded"} · Joined church:{" "}
            {r.source.joined || "Not recorded"} · Assigned to:{" "}
            {r.source.assigned || "Not recorded"}
          </p>
          <details>
            <summary>Original details and review notes</summary>
            <dl>
              {Object.entries(r.source).map(([k, v]) => (
                <div key={k}>
                  <dt>
                    <strong>{k}</strong>
                  </dt>
                  <dd style={{ overflowWrap: "anywhere", marginBottom: 8 }}>
                    {v || "Not recorded"}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
          <p role="status">
            {r.memberId
              ? "Imported — available in People register"
              : messages[r.row] || "Ready for duplicate check"}
          </p>
          <button
            disabled={busy || !!r.memberId}
            onClick={() => void save([r])}
          >
            {r.memberId ? "Imported" : "Import this guest"}
          </button>
        </article>
      ))}
    </main>
  );
}
