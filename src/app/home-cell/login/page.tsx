"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import "./login.css";
export default function Login() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [remember, setRemember] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(false),
    [staffMode, setStaffMode] = useState(false),
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
          <p>
            {staffMode
              ? "Administrator / coordinator password sign-in."
              : "Cell leaders: use your coordinator-generated four-digit PIN."}
          </p>
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
                    body: JSON.stringify({
                      email: email.trim(),
                      identifier: email.trim(),
                      password,
                      pin: password,
                      mode: staffMode ? "staff" : "pin",
                      remember,
                    }),
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
            <label htmlFor="hcl-email">
              {recover ? "Email address" : "Email or phone number"}
            </label>
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
                <label htmlFor="hcl-password">
                  {staffMode ? "Password" : "4-digit PIN"}
                </label>
                <div className="hcl-password">
                  <input
                    id="hcl-password"
                    required
                    type={visible ? "text" : "password"}
                    autoComplete="current-password"
                    maxLength={staffMode ? 1024 : 4}
                    minLength={staffMode ? 1 : 4}
                    inputMode={staffMode ? "text" : "numeric"}
                    pattern={staffMode ? undefined : "[0-9]{4}"}
                    placeholder={
                      staffMode ? "Enter your password" : "Enter 4-digit PIN"
                    }
                    value={password}
                    disabled={busy}
                    onChange={(e) =>
                      setPassword(
                        staffMode
                          ? e.target.value
                          : e.target.value.replace(/\D/g, "").slice(0, 4),
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label={visible ? "Hide credential" : "Show credential"}
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
            {!recover && (
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />{" "}
                Keep me logged in on this device
              </label>
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
              setStaffMode(!staffMode);
              setRecover(false);
              setPassword("");
              setError("");
            }}
          >
            {staffMode
              ? "Cell leader PIN sign-in"
              : "Administrator / coordinator sign-in"}
          </button>
          {staffMode && (
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
          )}
          {recoveryMessage && <p role="status">{recoveryMessage}</p>}
          <p className="hcl-help">
            Lost your PIN? Ask your Home Cell coordinator to generate a
            replacement. You cannot choose or change your PIN yourself.
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
