"use client";
import "../friend-login/pin-login.css";
import { useState } from "react";
export default function Page() {
  const [identifier, setIdentifier] = useState(""),
    [pin, setPin] = useState(""),
    [remember, setRemember] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="friend-pin-login">
      <h1>Foundational Class Leader</h1>
      <p>Sign in with your email or phone number and four-digit PIN.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/cfc/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ identifier, pin, remember }),
            });
            const d = await r.json();
            if (!r.ok) throw Error(d.message);
            window.location.assign("/cfc");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to sign in.");
            setPin("");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email or phone
          <input
            required
            autoComplete="username"
            value={identifier}
            maxLength={254}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </label>
        <label>
          Four-digit PIN
          <input
            required
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            minLength={4}
            maxLength={4}
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <label className="login-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />{" "}
          Keep me logged in on this device
        </label>
        <p className="login-remember-note">
          Leave unchecked on a shared device.
        </p>
        {error && <p role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p>Forgotten your PIN? Ask your Follow Through coordinator to reset it.</p>
      <a href="/access">Staff password sign-in</a>
    </main>
  );
}
