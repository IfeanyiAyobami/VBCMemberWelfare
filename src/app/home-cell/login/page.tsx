"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import "./login.css";
export default function Login() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(false),
    [recover, setRecover] = useState(false),
    [recoveryMessage, setRecoveryMessage] = useState("");
  const router = useRouter();
  return (
    <main className="hco-login">
      <section className="hcl-story" aria-label="Home Cell Office">
        <a className="hcl-brand" href="https://vinebranchchurch.org/">
          <img
            src="/assets/image-7d4e31b34082.png"
            alt="Vine Branch Church logo"
          />
          <span>
            VINE BRANCH CHURCH<small>Heaven-backed. Bible-based.</small>
          </span>
        </a>
        <div className="hcl-intro">
          <span className="hcl-eyebrow">HOME CELL OFFICE</span>
          <h1>
            Small groups.
            <br />
            Stronger connections.
          </h1>
          <p>
            A dedicated workspace for the leaders who care for our home-cell
            community.
          </p>
          <div className="hcl-features">
            <span>People & fellowship</span>
            <span>Leadership & care</span>
            <span>Reports & accountability</span>
          </div>
        </div>
        <footer>Vine Branch Church · Ibadan, Nigeria</footer>
      </section>
      <section className="hcl-entry">
        <div className="hcl-card">
          <span className="hcl-kicker">LEADERSHIP ACCESS</span>
          <h2>Welcome back</h2>
          <p>Sign in with your approved leadership account.</p>
          <form
            aria-busy={busy}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await fetch(
                  recover ? "/api/home-cell/recover" : "/api/home-cell/login",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: email.trim(), identifier: email.trim(), password }),
                  },
                );
                const j = await r.json();
                if (!r.ok)
                  throw Error(j.message || "Sign-in failed. Please try again.");
                if (recover) {
                  setRecoveryMessage(j.message);
                  return;
                }
                router.replace(j.next);
                router.refresh();
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Sign-in unavailable. Please try again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="hcl-email">{recover ? "Email address" : "Email or phone number"}</label>
            <input
              id="hcl-email"
              required
              type={recover ? "email" : "text"}
              autoComplete="username"
              maxLength={254}
              placeholder={recover ? "you@example.com" : "Email or 08012345678"}
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
            {!recover && (
              <>
                <label htmlFor="hcl-password">Password</label>
                <div className="hcl-password">
                  <input
                    id="hcl-password"
                    required
                    type={visible ? "text" : "password"}
                    autoComplete="current-password"
                    maxLength={1024}
                    placeholder="Enter your password"
                    value={password}
                    disabled={busy}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={visible ? "Hide password" : "Show password"}
                    aria-pressed={visible}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? "Hide" : "Show"}
                  </button>
                </div>
              </>
            )}
            {error && (
              <div className="hcl-error" role="alert">
                {error}
              </div>
            )}
            <button className="hcl-submit" disabled={busy} type="submit">
              {busy
                ? "Please wait…"
                : recover
                  ? "Send recovery email"
                  : "Sign in to your workspace"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <button
            type="button"
            className="hcl-recovery-toggle"
            onClick={() => {
              setRecover(!recover);
              setError("");
              setRecoveryMessage("");
            }}
          >
            {recover ? "Return to sign in" : "Forgot your password?"}
          </button>
          {recoveryMessage && <p role="status">{recoveryMessage}</p>}
          <p className="hcl-help">
            Need access or help with your password?
            <br />
            Phone-only accounts: contact your church administrator for password help.
          </p>
          <div className="hcl-footnote">
            Access is limited to verified leadership assignments.
          </div>
        </div>
        <a className="hcl-back" href="https://vinebranchchurch.org/">
          ← Return to church website
        </a>
      </section>
    </main>
  );
}
