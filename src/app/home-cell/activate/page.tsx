"use client";
import { useEffect, useState, type FormEvent } from "react";
import "../login/login.css";
export default function Activate() {
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    const access_token = p.get("access_token"),
      refresh_token = p.get("refresh_token"),
      code = new URLSearchParams(location.search).get("code");
    const temporary = new URLSearchParams(location.search).get("temporary") === "1";
    history.replaceState(null, "", location.pathname);
    if (p.get("error_description")) {
      setError(p.get("error_description")!);
      return;
    }
    if (!temporary && !code && (!access_token || !refresh_token)) {
      setError("Open the latest invitation or recovery link from your email.");
      return;
    }
    void fetch("/api/home-cell/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(temporary ? {check: true} : { access_token, refresh_token, code }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Error(j.message);
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/home-cell/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: f.get("password") }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.message);
      location.assign("/home-cell");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      className="hco-login"
      style={{ display: "grid", placeItems: "center", padding: 24 }}
    >
      <section className="hcl-card">
        <img
          src="/assets/image-7d4e31b34082.png"
          alt="Vine Branch Church"
          width="56"
        />
        <h2>Set your password</h2>
        <p>Choose a personal password of at least 12 characters to continue.</p>
        {error && (
          <p className="hcl-error" role="alert">
            {error}
          </p>
        )}
        {ready ? (
          <form onSubmit={save}>
            <label>
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
              />
            </label>
            <label>
              Confirm password
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
              />
            </label>
            <button className="hcl-submit" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </button>
          </form>
        ) : (
          !error && <p role="status">Checking your secure link…</p>
        )}
        <a href="/home-cell/login">Return to sign in</a>
      </section>
    </main>
  );
}
