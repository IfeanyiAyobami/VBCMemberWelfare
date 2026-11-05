"use client";
import { useState, useEffect } from "react";
type Account = {
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  failures: number;
  active: boolean;
};
type Credential = {
  pin: string;
  name: string;
  email: string | null;
  phone: string | null;
};
export default function CfcLeaderAccounts() {
  const [items, setItems] = useState<Account[]>([]),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [credential, setCredential] = useState<Credential | null>(null);
  async function load() {
    const r = await fetch("/api/cfc/accounts", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw Error(d.message);
    setItems(d.items);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function save(action: string, userId?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/cfc/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId, name, email, phone }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.message);
      setCredential(d);
      if (action === "create") {
        setName("");
        setEmail("");
        setPhone("");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="vj-wide vj-cfc-accounts"
      style={{
        border: "1px solid var(--line,#6b6bac)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h3>Create CFC Leader account</h3>
      <p>
        Email and/or phone number · four-digit PIN · CFC leader access only.
        Home Cell leaders receive a separate CFC leader login; their Home Cell
        password stays unchanged.
      </p>
      {error && <div role="alert">{error}</div>}
      {credential ? (
        <div role="alertdialog" aria-label="CFC leader login PIN">
          <h4>{credential.name} — login details</h4>
          <p>
            {credential.email} {credential.phone}
          </p>
          <p>
            PIN:{" "}
            <strong style={{ fontSize: 30, letterSpacing: 6 }}>
              {credential.pin}
            </strong>
          </p>
          <p>
            Sign in at <a href="/cfc-login">/cfc-login</a>. Share these details
            privately. Forgotten PINs can be reset below.
          </p>
          <button
            type="button"
            className="vj-primary"
            onClick={() => setCredential(null)}
          >
            I have saved the login details
          </button>
        </div>
      ) : (
        <>
          <label>
            Name
            <input
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Email (optional if phone supplied)
            <input
              type="email"
              value={email}
              maxLength={254}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Phone (optional if email supplied)
            <input
              type="tel"
              value={phone}
              maxLength={30}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="vj-primary"
            disabled={
              busy ||
              items.some((x) => x.active) ||
              !name.trim() ||
              (!email.trim() && !phone.trim())
            }
            onClick={() => void save("create")}
          >
            {busy ? "Saving…" : "Create CFC leader and generate PIN"}
          </button>
        </>
      )}
      <p>
        One active CFC leader for now. The leader creates cohorts and assigns
        participants from their own dashboard.
      </p>
      <h4>CFC leader account</h4>
      {items.map((x) => (
        <div
          key={x.user_id}
          style={{
            padding: "12px 0",
            borderTop: "1px solid var(--line,#6b6bac)",
          }}
        >
          <strong>{x.name}</strong>
          <button
            type="button"
            className="vj-secondary"
            disabled={busy || !!credential}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/cfc", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: x.active ? "suspend" : "reactivate",
                    data: { leader: x.user_id },
                  }),
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.message);
                await load();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Unable to update access.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {x.active ? "Deactivate account" : "Reactivate account"}
          </button>
          <p>
            {x.email} {x.phone} ·{" "}
            {x.failures >= 20
              ? "Locked — reset PIN"
              : x.active
                ? "Active"
                : "Inactive"}
          </p>
          <button
            type="button"
            className="vj-secondary"
            disabled={busy || !!credential || !x.active}
            onClick={() => void save("reset", x.user_id)}
          >
            Reset four-digit PIN
          </button>
        </div>
      ))}
    </section>
  );
}
