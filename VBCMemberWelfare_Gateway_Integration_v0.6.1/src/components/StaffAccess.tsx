"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { mountThemeToggle } from "@/lib/theme.js";

export default function StaffAccess({
  next = "/overview",
  initialMessage = "",
  configurationMessage = "",
  help = false,
}: {
  next?: string;
  initialMessage?: string;
  configurationMessage?: string;
  help?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(initialMessage);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  useEffect(
    () => (root.current ? mountThemeToggle(root.current) : undefined),
    [],
  );
  useEffect(() => {
    if (error) errorBox.current?.focus();
  }, [error]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || configurationMessage) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
      setError("Enter a valid team email and your password.");
      return;
    }
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, next }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.message || "We could not sign you in. Please try again.",
        );
        setPending(false);
        return;
      }
      // A full navigation waits for the server-set cookie before loading a protected page.
      window.location.replace(result.next || "/overview");
    } catch {
      setError(
        "We cannot reach sign-in right now. Check your connection and try again.",
      );
      setPending(false);
    }
  }

  return (
    <div ref={root} className="staff-access">
      <a className="skip" href="#staff-main">
        Skip to sign in
      </a>
      <header className="staff-access-header">
        <a href="https://vinebranchchurch.org/" className="staff-access-brand">
          <img src="/assets/image-7d4e31b34082.png" alt="Vine Branch Church" />
          <span>
            VINE BRANCH<small>Member care</small>
          </span>
        </a>
        <button
          type="button"
          id="theme-toggle"
          className="theme-toggle icon-button"
          aria-label="Switch to light mode"
          aria-pressed="true"
        >
          <span>Light mode</span>
        </button>
      </header>
      <main id="staff-main" className="staff-access-grid">
        <section
          className="staff-access-story"
          aria-labelledby="staff-story-title"
        >
          <span className="eyebrow">THE CARE DESK</span>
          <h1 id="staff-story-title">
            Every person.
            <br />
            <span>Remembered.</span>
          </h1>
          <p>
            A warm welcome. A birthday blessing. A message that says, “You
            belong here.”
          </p>
          <div className="staff-access-values">
            <span>
              <i aria-hidden="true">01</i> Welcome with intention
            </span>
            <span>
              <i aria-hidden="true">02</i> Celebrate their story
            </span>
            <span>
              <i aria-hidden="true">03</i> Stay connected with care
            </span>
          </div>
          <div className="staff-access-caption">
            Vine Branch Church · Ibadan, Nigeria
          </div>
        </section>
        <section className="card staff-access-card">
          <div className="card-pad">
            <span className="staff-lock" aria-hidden="true">
              ✦
            </span>
            <div className="eyebrow">CHURCH OFFICE</div>
            <h2>{help ? "Let’s get you back in." : "Welcome back."}</h2>
            <p className="muted mt">
              {help
                ? "Your church administrator can help you regain access."
                : "Sign in to care for our church family."}
            </p>
            {configurationMessage && (
              <div className="notice red" role="alert">
                <strong>Connection setup needed</strong>
                <p className="mt">{configurationMessage}</p>
              </div>
            )}
            {help ? (
              <div className="staff-help">
                <p>
                  Contact the administrator who created your staff account and
                  ask them to reset your Supabase Auth password.
                </p>
                <p className="hint">
                  Self-service recovery email is being prepared for the next
                  stage.
                </p>
                <a href="/access" className="btn primary w100">
                  Return to sign in
                </a>
              </div>
            ) : (
              <form onSubmit={signIn} noValidate aria-busy={pending}>
                {error && (
                  <div
                    ref={errorBox}
                    className="notice red"
                    role="alert"
                    tabIndex={-1}
                  >
                    {error}
                  </div>
                )}
                <div className="field">
                  <label htmlFor="staff-email">
                    Team email <span>*</span>
                  </label>
                  <input
                    id="staff-email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="username"
                    maxLength={254}
                    required
                    disabled={pending}
                  />
                </div>
                <div className="field">
                  <label htmlFor="staff-password">
                    Password <span>*</span>
                  </label>
                  <div className="staff-password">
                    <input
                      id="staff-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      maxLength={1024}
                      required
                      disabled={pending}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <button
                  className="btn primary w100"
                  type="submit"
                  disabled={pending || !!configurationMessage}
                >
                  {pending ? "Signing you in…" : "Sign in to the care desk"}
                  <span aria-hidden="true"> →</span>
                </button>
                <a className="text-link staff-help-link" href="/access/recover">
                  Need help signing in?
                </a>
              </form>
            )}
            <div className="staff-access-footnote">
              <span aria-hidden="true">●</span> Access is reserved for approved
              church staff.
            </div>
          </div>
        </section>
      </main>
      <footer className="staff-access-footer">
        <span>Vine Branch Church · Member care</span>
        <span>Staff login connected · Dashboard data in preview</span>
      </footer>
    </div>
  );
}
