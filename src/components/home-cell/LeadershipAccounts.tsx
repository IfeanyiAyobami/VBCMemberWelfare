"use client";
import LeaderContacts from "./LeaderContacts";
import AuditHistory from "./AuditHistory";
import { useCallback, useEffect, useState, type FormEvent } from "react";
type Area = { id: string; name: string };
type Cell = { id: string; area_id: string; name: string };
type Assignment = {
  id: string;
  user_id: string;
  role: string;
  area_id: string | null;
  cell_id: string | null;
  email: string;
  phone?: string;
  needsPhoneRepair?: boolean;
  name: string;
  lastSignIn: string | null;
  suspended: boolean;
};
export default function LeadershipAccounts() {
  const [areas, setAreas] = useState<Area[]>([]),
    [cells, setCells] = useState<Cell[]>([]),
    [admin, setAdmin] = useState(false),
    [items, setItems] = useState<Assignment[]>([]),
    [search, setSearch] = useState(""),
    [roleFilter, setRoleFilter] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<Assignment | null>(null),
    [credentials, setCredentials] = useState<{login: string; password: string} | null>(null),
    [mode, setMode] = useState("invite"),
    [form, setForm] = useState({
      email: "",
      phone: "",
      full_name: "",
      role: "cell_leader",
      area_id: "",
      cell_id: "",
    }),
    [reason, setReason] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/home-cell/leaders", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw Error(j.message);
      setItems(j.leaders);
      setAdmin(j.churchAdmin);
      const d = await fetch("/api/home-cell/directory", { cache: "no-store" });
      const dir = await d.json();
      if (!d.ok) throw Error(dir.message);
      setAreas(dir.areas);
      setCells(dir.cells);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Directory unavailable");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function request(url: string, payload: unknown) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setMessage("");
    setCredentials(null);
    try {
      let r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let j = await r.json();
      if (j.code === "EXISTING_ACCOUNT_CONFIRMATION_REQUIRED") {
        if (!confirm(j.message + "\n\n" + j.email)) return false;
        r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(payload as Record<string, unknown>),
            confirm_existing: true,
          }),
        });
        j = await r.json();
      }
      if (!r.ok) throw Error(j.message);
      if (j.temporary_password) setCredentials({login: j.login, password: j.temporary_password});
      setMessage(j.message || "Leadership change saved.");
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === "invite") {
      await request("/api/home-cell/leaders", form);
    } else if (mode === "existing") {
      await request("/api/home-cell/leaders", {
        ...form,
        existing_only: true,
        reason,
      });
    } else if (selected) {
      await request("/api/home-cell/leaders/action", {
        ...form,
        action: mode,
        user_id: selected.user_id,
        assignment_id: selected.id,
        reason,
      });
    }
  };
  const act = async (x: Assignment, action: string) => {
    if (reason.trim().length < 5) {
      setError(
        "Enter a reason of at least five characters before changing access.",
      );
      return;
    }
    if (confirm(`Confirm ${action.replaceAll("_", " ")} for ${x.email}?`))
      await request("/api/home-cell/leaders/action", {
        assignment_id: x.id,
        action,
        reason,
      });
  };
  const rows = items.filter(
    (x) =>
      (!roleFilter || x.role === roleFilter) &&
      `${x.email} ${x.phone || ""} ${x.name} ${x.role}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="hc-leadership">
      <div className="hc-stats">
        {[
          ["Total Leaders", new Set(items.map((x) => x.user_id)).size],
          [
            "Coordinators",
            items.filter((x) => x.role === "coordinator").length,
          ],
          [
            "Area Leaders",
            items.filter((x) => x.role === "area_leader").length,
          ],
          [
            "Cell Leaders",
            items.filter((x) => x.role === "cell_leader").length,
          ],
        ].map(([label, n]) => (
          <article key={label}>
            <div>
              <span>{label}</span>
              <strong>{n}</strong>
              <small>Verified directory assignments</small>
            </div>
          </article>
        ))}
      </div>
      {error && (
        <div className="hc-alert" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="hc-feedback" role="status">
          {message}
        </div>
      )}
      {credentials && <section className="hc-panel" aria-label="New leader login">
        <h2>Copy the new leader login</h2>
        <p>Share privately. The leader must change this temporary password on first login.</p>
        <label>Login<input readOnly value={credentials.login} /></label>
        <label>Temporary password<input readOnly autoComplete="off" value={credentials.password} /></label>
        <button className="hc-secondary" onClick={async () => {
          try { await navigator.clipboard.writeText(`Login: ${credentials.login}\nTemporary password: ${credentials.password}\nSign in: ${location.origin}/home-cell/login`); setMessage("Login details copied."); }
          catch { setError("Clipboard unavailable. Select and copy the details above."); }
        }}>Copy login details</button>
        <button className="hc-secondary" onClick={() => setCredentials(null)}>Dismiss</button>
      </section>}
      <div className="hc-two-col">
        <section className="hc-panel">
          <header>
            <h2>Leadership Directory</h2>
            <button
              className="hc-secondary"
              onClick={() => {
                setMode("invite");
                setSelected(null);
              }}
            >
              + Create Account
            </button>
          </header>
          <div className="hc-form-row">
            <label>
              Search leaders
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email or role"
              />
            </label>
            <label>
              Role
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">All roles</option>
                {[
                  "church_admin",
                  "coordinator",
                  "area_leader",
                  "cell_leader",
                ].map((r) => (
                  <option key={r} value={r}>
                    {r.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {loading && <p role="status">Loading leadership accounts…</p>}
          <div className="hc-leader-list">
            {rows.map((x) => (
              <article className="hc-leader-card" key={x.id}>
                <div className="hc-person-row">
                  <span className="hc-avatar">
                    {x.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <b>{x.name}</b>
                    <small>{x.email || x.phone}</small>
                    <small>
                      {x.role.replaceAll("_", " ")} ·{" "}
                      {x.area_id
                        ? areas.find((a) => a.id === x.area_id)?.name
                        : x.cell_id
                          ? cells.find((c) => c.id === x.cell_id)?.name
                          : "Church-wide"}
                    </small>
                  </div>
                  <span
                    className={
                      "hc-badge " + (x.suspended ? "absent" : "approved")
                    }
                  >
                    {x.suspended ? "Suspended" : "Active"}
                  </span>
                </div>
                <small className="hc-muted">
                  Last sign-in:{" "}
                  {x.lastSignIn
                    ? new Date(x.lastSignIn).toLocaleString("en-NG", {
                        timeZone: "Africa/Lagos",
                      })
                    : "Not yet signed in"}
                </small>
                {x.needsPhoneRepair && <p className="hc-muted">This phone-only account needs a one-time login repair.</p>}
                <div className="hc-leader-actions">
                  {admin && x.needsPhoneRepair && <button className="hc-secondary" disabled={busy} onClick={async()=>{
                    if(reason.trim().length<5){setError("Enter a reason of at least five characters before repairing phone login.");return;}
                    if(confirm("Repair phone login for "+(x.phone||x.name)+"? Their password and assignments will stay unchanged."))
                      await request("/api/home-cell/leaders/phone",{assignment_id:x.id,reason});
                  }}>Repair phone login</button>}
                  <button
                    className="hc-secondary"
                    onClick={() => {
                      setSelected(x);
                      setMode("add_role");
                      setForm({
                        email: x.email,
                        phone: x.phone || "",
                        full_name: x.name,
                        role: x.role,
                        area_id: x.area_id || "",
                        cell_id: x.cell_id || "",
                      });
                    }}
                  >
                    Add Role
                  </button>
                  <button
                    className="hc-secondary"
                    onClick={() => {
                      setSelected(x);
                      setMode("replace_role");
                      setForm({
                        email: x.email,
                        phone: x.phone || "",
                        full_name: x.name,
                        role: x.role,
                        area_id: x.area_id || "",
                        cell_id: x.cell_id || "",
                      });
                    }}
                  >
                    Change / Reassign
                  </button>
                  <button
                    className="hc-secondary"
                    disabled={busy}
                    onClick={() => void act(x, "logout")}
                  >
                    End HCO Sessions
                  </button>
                  <button
                    className="hc-secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(x, x.suspended ? "reactivate" : "suspend")
                    }
                  >
                    {x.suspended ? "Reactivate" : "Suspend"}
                  </button>
                  <button
                    className="hc-danger"
                    disabled={busy}
                    onClick={() => void act(x, "remove_role")}
                  >
                    Archive Role
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!loading && !rows.length && (
            <p className="hc-empty">No matching leadership accounts.</p>
          )}
          <label>
            Reason for access changes
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              placeholder="Required for role and security changes"
            />
          </label>
        </section>
        <section className="hc-panel">
          <header>
            <h2>
              {mode === "invite"
                ? "Create / Assign Leader"
                : mode === "existing"
                  ? "Assign Existing Account"
                  : mode === "add_role"
                    ? "Add Leadership Role"
                    : "Change Role / Reassign"}
            </h2>
          </header>
          <p className="hc-muted">
            {mode === "invite"
              ? "Create a login using email, phone or both. Phone numbers work as usernames without SMS. New accounts receive a temporary password; existing accounts keep their current password."
              : mode === "add_role"
                ? "Add an assignment while preserving all existing assignments."
                : "Replace only the selected assignment. Other assignments remain unchanged."}
          </p>
          <div className="hc-form-row">
            <button
              className="hc-secondary"
              onClick={() => {
                setMode("invite");
                setSelected(null);
              }}
            >
              Create leader
            </button>
            <button
              className="hc-secondary"
              onClick={() => {
                setMode("existing");
                setSelected(null);
                setForm({
                  email: "",
      phone: "",
      full_name: "",
                  role: "cell_leader",
                  area_id: "",
                  cell_id: "",
                });
              }}
            >
              Assign existing account
            </button>
          </div>
          <form className="hc-form-grid" onSubmit={create}>
            <label className="hc-full">
              Email
              <input
                type="email"
                required={!form.phone}
                readOnly={mode !== "invite" && mode !== "existing"}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="hc-full">Phone number
              <input type="tel" value={form.phone} required={!form.email}
                readOnly={mode !== "invite" && mode !== "existing"}
                placeholder="08012345678 or +2348012345678"
                onChange={(e) => setForm({...form, phone: e.target.value})} />
            </label>
            {mode === "invite" && <label className="hc-full">Full name
              <input value={form.full_name} maxLength={160} onChange={(e) => setForm({...form, full_name: e.target.value})} />
            </label>}
            <label className="hc-full">
              Leadership Role
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value,
                    area_id: "",
                    cell_id: "",
                  })
                }
              >
                {(admin
                  ? [
                      "church_admin",
                      "coordinator",
                      "area_leader",
                      "cell_leader",
                    ]
                  : ["area_leader", "cell_leader"]
                ).map((r) => (
                  <option key={r} value={r}>
                    {r.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            {form.role !== "church_admin" && (
              <label className="hc-full">
                Area
                <select
                  required
                  value={form.area_id}
                  onChange={(e) =>
                    setForm({ ...form, area_id: e.target.value, cell_id: "" })
                  }
                >
                  <option value="">Select area</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {form.role === "cell_leader" && (
              <label className="hc-full">
                Home Cell
                <select
                  required
                  value={form.cell_id}
                  onChange={(e) =>
                    setForm({ ...form, cell_id: e.target.value })
                  }
                >
                  <option value="">Select cell</option>
                  {cells
                    .filter((c) => c.area_id === form.area_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {mode !== "invite" && (
              <label className="hc-full">
                Reason
                <input
                  required
                  minLength={5}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            <button className="hc-full" disabled={busy}>
              {busy
                ? "Saving…"
                : mode === "invite"
                  ? "Create / assign leader"
                  : "Save Assignment"}
            </button>
          </form>
          <p className="hc-muted">
            End HCO Sessions requires a fresh login for Home Cell access. It
            does not end Member Care sessions.
          </p>
        </section>
      </div>
      <LeaderContacts onCreate={(entry)=>{setMode("invite");setSelected(null);setCredentials(null);setForm({email:"",role:"cell_leader",...entry});setMessage("Directory details filled in. Check the phone number or add an email, then create the login.");window.scrollTo({top:0,behavior:"smooth"});}} />
      <AuditHistory revision={items.length} />
    </div>
  );
}
