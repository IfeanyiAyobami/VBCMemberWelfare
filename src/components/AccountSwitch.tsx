"use client";
import { useState } from "react";
import { loadOutbox, clearFriendStorage } from "@/lib/journey/outbox";
export default function AccountSwitch({
  name,
  userId,
}: {
  name: string;
  userId: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="staff-account-switch">
      <img src="/assets/image-7d4e31b34082.png" alt="Vine Branch Church" />
      <h1>Switch account</h1>
      <p>
        You are signed in as <strong>{name}</strong>. This account has access to
        Follow Through only.
      </p>
      <p>
        To open the main dashboard, sign out and use your Church Administrator
        account.
      </p>
      <p>
        Your browser uses one dashboard login at a time. For two accounts at
        once, use separate browser profiles.
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        className="btn primary"
        disabled={busy}
        onClick={async () => {
          const pending = loadOutbox(userId).length;
          if (
            pending &&
            !confirm(
              `${pending} update(s) have not been sent. Sign out and discard these local updates?`,
            )
          )
            return;
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/auth/logout", { method: "POST" });
            if (!r.ok)
              throw Error("Sign out could not finish. Please try again.");
            clearFriendStorage(userId);
            window.location.replace("/access");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to sign out.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing out…" : "Sign out and use another account"}
      </button>
      <a href="/followups">Return to my dashboard</a>
    </main>
  );
}
