"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import JourneyImport from "./JourneyImport";
import { DirectRegistrationFields } from "./JourneyExtensions";

/** Friend-owned registration screens. No navigation to the staff workspace. */
export default function FriendRegistration({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const replay = useRef<{ body: string; id: string } | null>(null);
  const [mode, setMode] = useState<"form" | "csv">("form");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    if (mode === "csv") dialog.current?.close();
    else if (!dialog.current?.open) dialog.current?.showModal();
  }, [mode]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data: Record<string, unknown> = Object.fromEntries(
      new FormData(e.currentTarget),
    );
    if (!data.existingId)
      for (const key of ["contactConsent", "emailOptIn", "smsOptIn"])
        data[key] = data[key] === "true";
    const body = JSON.stringify(data);
    if (replay.current?.body !== body)
      replay.current = { body, id: crypto.randomUUID() };
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/journey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "direct",
          data,
          requestId: replay.current.id,
        }),
        signal: AbortSignal.timeout(25000),
      });
      const x = await r.json();
      if (!r.ok) throw Error(x.message || "Registration could not be saved.");
      onSaved();
      setMessage(
        "Person registered successfully. They are available in your people list.",
      );
    } catch (e) {
      setMessage(
        (e instanceof Error ? e.message : "Unable to register.") +
          " Your entered details are still here. Retrying the same details is safe.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="vj-app fm-registration">
      <dialog
        className="fm-sheet fm-registration-sheet"
        ref={dialog}
        aria-label="Register a person"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else onClose();
        }}
      >
        <div className="fm-sheet-body">
          <header className="fm-registration-head">
            <h2 className="fm-q">Register a person</h2>
            <button className="fm-secondary" disabled={busy} onClick={onClose}>
              Close
            </button>
          </header>
          <p className="fm-muted">
            Register guests directly in your care. Existing records cannot be
            reassigned without Coordinator approval.
          </p>
          <button
            className="fm-secondary"
            disabled={busy}
            onClick={() => setMode("csv")}
          >
            Import CSV instead
          </button>
          <form onSubmit={save}>
            <fieldset disabled={busy}>
              <DirectRegistrationFields />
            </fieldset>
            {message && (
              <p className="fm-registration-message" role="status">
                {message}
              </p>
            )}
            <button className="fm-save" disabled={busy}>
              {busy ? "Saving…" : "Register person"}
            </button>
          </form>
        </div>
      </dialog>
      {mode === "csv" && (
        <JourneyImport onClose={() => setMode("form")} onSaved={onSaved} />
      )}
    </div>
  );
}
