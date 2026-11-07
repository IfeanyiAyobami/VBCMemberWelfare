"use client";

import { useEffect, useState } from "react";
import "./home-cell/leader-app.css";
import "../app/friend-login/pin-login.css";

const themeKey = "hco-reference-theme";

export default function PinSignIn({
  title,
  endpoint,
  help,
  next,
  homeCell = false,
}: {
  title: string;
  endpoint: string;
  help: string;
  next: string;
  homeCell?: boolean;
}) {
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [visible, setVisible] = useState(false);
  const [dark, setDark] = useState(false);
  const [mode, setMode] = useState<"pin" | "staff" | "recover">("pin");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      setDark(localStorage.getItem(themeKey) === "dark");
    } catch {}
  }, []);
  const switchMode = (value: typeof mode) => {
    setMode(value);
    setVisible(false);
    setPassword("");
    setError("");
    setNotice("");
  };
  return (
    <main className={`lx-app pin-login ${dark ? "lx-dark" : ""}`}>
      <section className="lx-screen pin-screen" aria-label={title}>
        <button
          className="lx-theme pin-theme"
          type="button"
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => {
            setDark(!dark);
            try {
              localStorage.setItem(themeKey, dark ? "light" : "dark");
            } catch {}
          }}
        >
          <span aria-hidden>{dark ? "☀" : "☾"}</span>
        </button>
        <header className="pin-header">
          <img
            src="/assets/image-7d4e31b34082.png"
            width="72"
            height="72"
            alt="Vine Branch Church"
          />
          <h1 className="lx-title">
            {mode === "pin"
              ? "Welcome"
              : mode === "staff"
                ? "Staff sign-in"
                : "Reset password"}
          </h1>
          <p>{title}</p>
        </header>
        <form
          className="pin-form"
          aria-busy={busy}
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            setNotice("");
            try {
              const response = await fetch(
                mode === "recover" ? "/api/home-cell/recover" : endpoint,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(
                    mode === "recover"
                      ? { email: identifier.trim() }
                      : mode === "staff"
                        ? {
                            identifier: identifier.trim(),
                            password,
                            mode: "staff",
                            remember,
                          }
                        : { identifier: identifier.trim(), pin, remember },
                  ),
                },
              );
              const result = await response.json();
              if (!response.ok)
                throw Error(
                  result.message || "Unable to sign in. Please try again.",
                );
              if (mode === "recover") setNotice(result.message);
              else window.location.assign(result.next || next);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Unable to sign in. Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="lx-field" htmlFor="hcl-email">
            {mode === "recover" ? "Email address" : "Email or phone number"}
            <input
              id="hcl-email"
              type={mode === "recover" ? "email" : "text"}
              inputMode={mode === "recover" ? "email" : "tel"}
              autoComplete="username"
              required
              maxLength={254}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </label>
          {mode !== "recover" && (
            <>
              <div className="lx-field">
                <div className="pin-label">
                  <label htmlFor="hcl-password">
                    {mode === "pin" ? "4-digit PIN" : "Password"}
                  </label>
                  <button
                    type="button"
                    className="pin-show"
                    aria-controls="hcl-password"
                    aria-pressed={visible}
                    aria-label={`${visible ? "Hide" : "Show"} ${mode === "pin" ? "PIN" : "password"}`}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? "Hide" : "Show"}
                  </button>
                </div>
                {mode === "pin" ? (
                  <>
                    <div className="pin-boxes">
                      <div className="pin-digits" aria-hidden="true">
                        {Array.from({ length: 4 }, (_, i) => (
                          <span
                            key={i}
                            className={
                              i === Math.min(pin.length, 3)
                                ? "pin-active"
                                : undefined
                            }
                          >
                            {pin[i] ? (visible ? pin[i] : "•") : ""}
                          </span>
                        ))}
                      </div>
                      <input
                        id="hcl-password"
                        aria-describedby="pin-hint"
                        type={visible ? "text" : "password"}
                        inputMode="numeric"
                        pattern={"\\d{4}"}
                        maxLength={4}
                        autoComplete="current-password"
                        required
                        value={pin}
                        onChange={(e) =>
                          setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                        }
                      />
                    </div>
                    <span className="lx-hint" id="pin-hint">
                      Your Coordinator gave you this number.
                    </span>
                  </>
                ) : (
                  <input
                    id="hcl-password"
                    required
                    type={visible ? "text" : "password"}
                    autoComplete="current-password"
                    maxLength={1024}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </div>
              <label className="pin-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />{" "}
                Keep me signed in on this phone
              </label>
            </>
          )}
          {error && (
            <p className="lx-alert" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="lx-notice" role="status">
              {notice}
            </p>
          )}
          <button className="lx-btn lx-primary" disabled={busy} type="submit">
            {busy
              ? "Please wait…"
              : mode === "recover"
                ? "Send recovery email"
                : "Sign in"}
          </button>
        </form>
        <footer className="pin-footer">
          {mode === "pin" && <p>{help}</p>}
          {homeCell ? (
            <>
              <button
                type="button"
                disabled={busy}
                className="pin-link"
                onClick={() => switchMode(mode === "pin" ? "staff" : "pin")}
              >
                {mode === "pin"
                  ? "Administrator / coordinator sign-in"
                  : "Leader PIN sign-in"}
              </button>
              {mode !== "pin" && (
                <button
                  type="button"
                  disabled={busy}
                  className="pin-link"
                  onClick={() =>
                    switchMode(mode === "recover" ? "staff" : "recover")
                  }
                >
                  {mode === "recover"
                    ? "Return to staff sign-in"
                    : "Forgot your password?"}
                </button>
              )}
            </>
          ) : (
            <a className="pin-link" href="/access">
              Staff password sign-in
            </a>
          )}
        </footer>
      </section>
    </main>
  );
}
