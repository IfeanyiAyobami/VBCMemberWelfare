"use client";
import { useEffect, useState, useRef } from "react";
export default function JourneyCelebrationDates({
  member,
}: {
  member: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({
      birthdayMonth: "",
      birthdayDay: "",
      anniversaryMonth: "",
      anniversaryDay: "",
    }),
    [message, setMessage] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const replay = useRef<{ body: string; id: string } | null>(null);
  useEffect(() => {
    let active = true;
    setReady(false);
    fetch("/api/journey/celebration-dates?member=" + member, {
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.message);
        if (active) {
          setValues(
            Object.fromEntries(
              Object.entries(d).map(([k, v]) => [
                k,
                v == null ? "" : String(v),
              ]),
            ),
          );
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [member]);
  return (
    <section className="vj-card">
      <h3>Birthday & wedding anniversary</h3>
      <p>
        Optional month and day only. Saved on the central person record for
        church-office celebration messages. Leave unknown dates blank.
      </p>
      {Object.entries(values).map(([key, v]) => (
        <label key={key} style={{ display: "inline-grid", gap: 6, margin: 8 }}>
          {
            (
              {
                birthdayMonth: "Birthday month",
                birthdayDay: "Birthday day",
                anniversaryMonth: "Anniversary month",
                anniversaryDay: "Anniversary day",
              } as Record<string, string>
            )[key]
          }
          <input
            type="number"
            min={1}
            max={key.endsWith("Month") ? 12 : 31}
            value={v}
            onChange={(e) =>
              setValues((x) => ({ ...x, [key]: e.target.value }))
            }
          />
        </label>
      ))}
      <p role="status">{message}</p>
      <button
        className="vj-secondary"
        disabled={!ready || busy}
        onClick={async () => {
          setBusy(true);
          const body = JSON.stringify({ member, data: values });
          if (replay.current?.body !== body)
            replay.current = { body, id: crypto.randomUUID() };
          try {
            const r = await fetch("/api/journey/celebration-dates", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                member,
                data: values,
                requestId: replay.current.id,
              }),
            });
            const d = await r.json();
            if (!r.ok) throw Error(d.message);
            setMessage(
              "Saved to the central directory. Messaging preferences remain unchanged.",
            );
            replay.current = null;
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Unable to save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Save celebration dates
      </button>
    </section>
  );
}
