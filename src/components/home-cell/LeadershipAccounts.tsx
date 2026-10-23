"use client";
import LeaderContacts from "./LeaderContacts";
import AuditHistory from "./AuditHistory";
import AccountDialog from "./AccountDialog";
import { normalizeLoginPhone } from "@/lib/home-cell/identity";
import "./leadership-accounts.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
  name: string;
  lastSignIn: string | null;
  suspended: boolean;
  needsPhoneRepair?: boolean;
  passwordChangeRequired?: boolean;
};
type Mode =
  | "create"
  | "manage"
  | "add_role"
  | "replace_role"
  | "remove_role"
  | "logout"
  | "suspend"
  | "reactivate"
  | "repair"
  | "password"
  | "credentials"
  | null;
type Credential = { login: string; password: string; warning?: string };
type Form = {
  email: string;
  phone: string;
  full_name: string;
  role: string;
  area_id: string;
  cell_id: string;
};
const blank: Form = {
  email: "",
  phone: "",
  full_name: "",
  role: "cell_leader",
  area_id: "",
  cell_id: "",
};
const titles: Record<string, string> = {
  church_admin: "Church administrator",
  coordinator: "Coordinator",
  area_leader: "Area leader",
  cell_leader: "Cell leader",
};
function friendly(text: string) {
  const messages: Record<string, string> = {
    HCO_CANNOT_CHANGE_OWN_ACCESS:
      "You cannot change your own access. Ask another church administrator.",
    HCO_TARGET_OUTSIDE_AUTHORITY:
      "This account has access outside your management area. Ask a church administrator.",
    HCO_ASSIGNMENT_NOT_FOUND:
      "This role has changed. Refresh the directory and try again.",
    HCO_REASON_REQUIRED: "Add a short reason of at least five characters.",
    HCO_SCOPE_DENIED:
      "You cannot assign leadership outside your management area.",
  };
  for (const [code, message] of Object.entries(messages))
    if (text.includes(code)) return message;
  return text.includes("HCO_")
    ? "This change could not be saved. Refresh and check your permissions and the selected assignment."
    : text;
}
export default function LeadershipAccounts() {
  const [areas, setAreas] = useState<Area[]>([]),
    [cells, setCells] = useState<Cell[]>([]),
    [items, setItems] = useState<Assignment[]>([]),
    [admin, setAdmin] = useState(false),
    [actorId, setActorId] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("accounts"),
    [search, setSearch] = useState(""),
    [roleFilter, setRoleFilter] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [mode, setMode] = useState<Mode>(null),
    [selected, setSelected] = useState<Assignment | null>(null),
    [detailTab, setDetailTab] = useState("roles"),
    [form, setForm] = useState<Form>({ ...blank }),
    [step, setStep] = useState(0),
    [reason, setReason] = useState(""),
    [shared, setShared] = useState(false);
  const [credentials, setCredentials] = useState<Credential | null>(null),
    [acknowledged, setAcknowledged] = useState(false),
    [revealed, setRevealed] = useState(false),
    [copied, setCopied] = useState(false);
  const [popup, setPopup] = useState<{
      kind: "error" | "success";
      title: string;
      message: string;
    } | null>(null),
    [confirmation, setConfirmation] = useState<{
      url: string;
      payload: Record<string, unknown>;
      message: string;
      identity: string;
    } | null>(null);
  const busyRef = useRef(false),
    requestId = useRef("");
  const notify = useCallback(
    (
      message: string,
      title = "Could not save changes",
      kind: "error" | "success" = "error",
    ) => setPopup({ message: friendly(message), title, kind }),
    [],
  );
  const auditError = useCallback(
    (message: string) => notify(message, "Activity log unavailable"),
    [notify],
  );
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r, d] = await Promise.all([
        fetch("/api/home-cell/leaders", { cache: "no-store" }),
        fetch("/api/home-cell/directory", { cache: "no-store" }),
      ]);
      const [j, dir] = await Promise.all([r.json(), d.json()]);
      if (!r.ok) throw Error(j.message);
      if (!d.ok) throw Error(dir.message);
      setItems(j.leaders);
      setAdmin(j.churchAdmin);
      setActorId(j.actorId || "");
      setAreas(dir.areas);
      setCells(dir.cells);
    } catch (e) {
      notify(
        e instanceof Error
          ? e.message
          : "The directory could not load. Please retry.",
        "Directory unavailable",
      );
    } finally {
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!credentials) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [credentials]);
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter]);
  const groups = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const item of items)
      map.set(item.user_id, [...(map.get(item.user_id) || []), item]);
    return [...map.values()];
  }, [items]);
  const rows = groups.filter((group) => {
    const x = group[0];
    return (
      (!roleFilter || group.some((r) => r.role === roleFilter)) &&
      (!statusFilter ||
        (statusFilter === "suspended"
          ? x.suspended
          : statusFilter === "pending"
            ? x.passwordChangeRequired
            : !x.suspended)) &&
      `${x.name} ${x.email} ${x.phone || ""} ${group.map((r) => titles[r.role] + " " + scope(r)).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  const pages = Math.max(1, Math.ceil(rows.length / 12)),
    visiblePage = Math.min(page, pages),
    visible = rows.slice((visiblePage - 1) * 12, visiblePage * 12);
  const assignments = selected
    ? items.filter((x) => x.user_id === selected.user_id)
    : [];
  function scope(x: Pick<Assignment, "area_id" | "cell_id">) {
    return x.cell_id
      ? cells.find((c) => c.id === x.cell_id)?.name || "Home cell"
      : x.area_id
        ? areas.find((a) => a.id === x.area_id)?.name || "Area"
        : "Church-wide";
  }
  function openCreate(entry?: Partial<Form>) {
    setSelected(null);
    setForm({ ...blank, ...entry });
    setStep(0);
    setReason("");
    setMode("create");
  }
  function openAction(action: Mode, x: Assignment) {
    setSelected(x);
    setReason("");
    setShared(false);
    requestId.current = crypto.randomUUID();
    if (action === "add_role" || action === "replace_role")
      setForm({
        ...blank,
        email: x.email,
        phone: x.phone || "",
        full_name: x.name,
        role: x.role,
        area_id:
          x.area_id || cells.find((c) => c.id === x.cell_id)?.area_id || "",
        cell_id: x.cell_id || "",
      });
    setMode(action);
  }
  function close() {
    if (busyRef.current) return;
    if (mode === "credentials" && !acknowledged) return;
    setMode(null);
    if (mode === "credentials") {
      setCredentials(null);
      setRevealed(false);
      setCopied(false);
    }
  }
  async function request(url: string, payload: Record<string, unknown>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    let saved = false;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw Error(
          "The server response was interrupted. Check the account list before retrying. If a password was created but not received, use Generate replacement password.",
        );
      }
      if (data.code === "EXISTING_ACCOUNT_CONFIRMATION_REQUIRED") {
        setConfirmation({
          url,
          payload,
          message: data.message,
          identity: data.email,
        });
        return;
      }
      if (!response.ok)
        throw Error(
          data.message || "The change could not be saved. Try again.",
        );
      saved = true;
      setRevision((x) => x + 1);
      if (data.temporary_password) {
        setCredentials({
          login: data.login,
          password: data.temporary_password,
          warning: data.audit_pending ? data.message : undefined,
        });
        setAcknowledged(false);
        setRevealed(false);
        setCopied(false);
        setMode("credentials");
      } else {
        setMode(null);
        notify(
          data.message || "The leadership change has been saved.",
          "Changes saved",
          "success",
        );
      }
      await refresh();
    } catch (e) {
      notify(
        e instanceof Error
          ? e.message
          : "Connection interrupted. Check the directory before retrying. If login details were lost, use Generate replacement password.",
        saved ? "Saved, but refresh failed" : "Action needs attention",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "create" && step === 0) {
      if (!form.email.trim() && !form.phone.trim()) {
        notify(
          "Enter an email address, phone number, or both.",
          "Add contact details",
        );
        return;
      }
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        notify("Enter a valid email address.", "Check the email address");
        return;
      }
      if (form.phone && !normalizeLoginPhone(form.phone)) {
        notify(
          "Enter a valid Nigerian phone number or an international number starting with +.",
          "Check the phone number",
        );
        return;
      }
      setStep(1);
      return;
    }
    if (["create", "add_role", "replace_role"].includes(mode || "")) {
      if (form.role !== "church_admin" && !form.area_id) {
        notify("Choose the area for this leadership role.", "Select an area");
        return;
      }
      if (form.role === "cell_leader" && !form.cell_id) {
        notify(
          "Choose the home cell this leader will manage.",
          "Select a home cell",
        );
        return;
      }
    }
    if (mode !== "create" && reason.trim().length < 5) {
      notify(
        "Add a short reason of at least five characters.",
        "A reason is required",
      );
      return;
    }
    if (mode === "password" && !shared) {
      notify(
        "Confirm that this leader needs a replacement and that their shared church dashboard password will change.",
        "Confirm password replacement",
      );
      return;
    }
    if (mode === "create") {
      await request("/api/home-cell/leaders", form);
      return;
    }
    if (!selected) return;
    if (mode === "password") {
      await request("/api/home-cell/leaders/password", {
        assignment_id: selected.id,
        reason,
        request_id: requestId.current,
        confirm_shared_password: shared,
      });
      return;
    }
    if (mode === "repair") {
      await request("/api/home-cell/leaders/phone", {
        assignment_id: selected.id,
        reason,
      });
      return;
    }
    await request("/api/home-cell/leaders/action", {
      ...(mode === "add_role" || mode === "replace_role" ? form : {}),
      action: mode,
      assignment_id: selected.id,
      reason,
    });
  }
  async function copy() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(credentialText());
      setCopied(true);
      setAcknowledged(true);
    } catch {
      notify(
        "Your browser could not copy automatically. Use Show password, then select and copy the login details.",
        "Copy manually",
      );
    }
  }
  function credentialText() {
    return credentials
      ? `Vine Branch Church — Home Cell Office\nSign in: ${location.origin}/home-cell/login\nLogin: ${credentials.login}\nTemporary password: ${credentials.password}\nChoose a new personal password at first sign-in.\nShare privately and delete this file after handover.\n`
      : "";
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([credentialText()], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "VBC-leader-temporary-login.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAcknowledged(true);
  }
  const actionTitle =
    mode === "password"
      ? "Generate replacement password"
      : mode === "repair"
        ? "Repair phone login"
        : mode === "remove_role"
          ? "Remove this role"
          : mode === "logout"
            ? "End Home Cell sessions"
            : mode === "suspend"
              ? "Suspend Home Cell access"
              : mode === "reactivate"
                ? "Reactivate account"
                : mode === "replace_role"
                  ? "Reassign leadership role"
                  : "Add leadership role";
  const reviewScope =
    form.role === "church_admin"
      ? "Church-wide"
      : form.role === "cell_leader"
        ? form.cell_id
          ? scope(form)
          : "Choose a home cell"
        : form.area_id
          ? scope(form)
          : "Choose an area";
  const roleFields = (
    <>
      <label>
        Leadership role
        <select
          aria-label="Leadership role"
          value={form.role}
          onChange={(e) =>
            setForm({ ...form, role: e.target.value, area_id: "", cell_id: "" })
          }
        >
          {(admin ? Object.keys(titles) : ["area_leader", "cell_leader"]).map(
            (r) => (
              <option key={r} value={r}>
                {titles[r]}
              </option>
            ),
          )}
        </select>
      </label>
      {form.role !== "church_admin" && (
        <label>
          Area
          <select
            aria-label="Area"
            required
            value={form.area_id}
            onChange={(e) =>
              setForm({ ...form, area_id: e.target.value, cell_id: "" })
            }
          >
            <option value="">Choose an area</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {form.role === "cell_leader" && (
        <label>
          Home cell
          <select
            aria-label="Home cell"
            required
            value={form.cell_id}
            onChange={(e) => setForm({ ...form, cell_id: e.target.value })}
          >
            <option value="">Choose a home cell</option>
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
    </>
  );
  return (
    <div className="hc-leadership la-page">
      <section className="la-intro">
        <div>
          <span className="la-eyebrow">PEOPLE & PERMISSIONS</span>
          <h2>People, roles & access</h2>
          <p>The right access. A simpler handover.</p>
        </div>
        <button
          className="la-primary"
          disabled={loading || busy}
          onClick={() => openCreate()}
        >
          + Add leader
        </button>
      </section>
      <div className="la-summary">
        {[
          ["People with access", groups.length],
          ["Active accounts", groups.filter((g) => !g[0].suspended).length],
          [
            "Password setup",
            groups.filter((g) => g[0].passwordChangeRequired).length,
          ],
          ["Suspended", groups.filter((g) => g[0].suspended).length],
        ].map(([label, n]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{n}</strong>
          </div>
        ))}
      </div>
      <nav className="la-tabs" aria-label="Leadership views">
        {[
          ["accounts", "Accounts"],
          ["contacts", "Church directory"],
          ["audit", "Activity log"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "accounts" && (
        <section
          className="la-directory"
          aria-label="Leadership accounts directory"
        >
          <header className="la-toolbar">
            <label className="la-search">
              Search accounts
              <input
                type="search"
                placeholder="Search name, email, phone or home cell…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Role
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">All roles</option>
                {Object.entries(titles).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="pending">Password setup</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <button
              className="la-subtle"
              onClick={() => void refresh()}
              disabled={loading || busy}
            >
              Refresh
            </button>
          </header>
          <div className="la-list-heading" aria-hidden="true">
            <span>Leader</span>
            <span>Roles & location</span>
            <span>Account status</span>
            <span>Manage</span>
          </div>
          {loading ? (
            <div className="la-loading" role="status">
              Loading leadership accounts…
            </div>
          ) : (
            visible.map((group) => {
              const x = group[0];
              return (
                <article className="la-account-row" key={x.user_id}>
                  <div className="la-person">
                    <span className="la-avatar">
                      {x.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <div>
                      <h3>{x.name}</h3>
                      <p>{x.email || x.phone || "Contact not available"}</p>
                      {x.email && x.phone && <small>{x.phone}</small>}
                    </div>
                  </div>
                  <div className="la-role-summary">
                    <b>
                      {group.length === 1
                        ? titles[x.role]
                        : `${group.length} leadership roles`}
                    </b>
                    <span>
                      {scope(x)}
                      {group.length > 1 ? " + more" : ""}
                    </span>
                  </div>
                  <div>
                    <span
                      className={
                        "la-status " +
                        (x.suspended
                          ? "is-suspended"
                          : x.passwordChangeRequired
                            ? "is-pending"
                            : "")
                      }
                    >
                      {x.suspended
                        ? "Suspended"
                        : x.passwordChangeRequired
                          ? "Password setup"
                          : "Active"}
                    </span>
                    {x.needsPhoneRepair && (
                      <small className="la-repair-note">
                        Phone login needs repair
                      </small>
                    )}
                  </div>
                  <button
                    className="la-manage"
                    aria-label={"Manage " + x.name}
                    onClick={() => {
                      setSelected(x);
                      setDetailTab("roles");
                      setMode("manage");
                    }}
                  >
                    Manage <span aria-hidden="true">↗</span>
                  </button>
                </article>
              );
            })
          )}
          {!loading && !rows.length && (
            <div className="la-empty">
              <h3>No matching accounts</h3>
              <p>Try another search or add a leader to get started.</p>
              <button
                className="la-subtle"
                onClick={() => {
                  setSearch("");
                  setRoleFilter("");
                  setStatusFilter("");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
          <footer className="la-pagination">
            <span>
              {rows.length
                ? `${(visiblePage - 1) * 12 + 1}–${Math.min(visiblePage * 12, rows.length)} of ${rows.length} accounts`
                : "0 accounts"}
              {items.length === 500
                ? " · Showing the first 500 role assignments"
                : ""}
            </span>
            <div>
              <button
                className="la-subtle"
                disabled={visiblePage === 1}
                onClick={() => setPage(visiblePage - 1)}
              >
                Previous
              </button>
              <span>
                {visiblePage} / {pages}
              </span>
              <button
                className="la-subtle"
                disabled={visiblePage === pages}
                onClick={() => setPage(visiblePage + 1)}
              >
                Next
              </button>
            </div>
          </footer>
        </section>
      )}
      {tab === "contacts" && (
        <LeaderContacts
          onCreate={(entry) => openCreate(entry)}
          onNotice={(message, kind) =>
            notify(
              message,
              kind === "error"
                ? "Directory needs attention"
                : "Directory updated",
              kind,
            )
          }
        />
      )}
      {tab === "audit" && (
        <AuditHistory revision={revision} onError={auditError} />
      )}
      <aside className="la-help">
        <span className="la-help-icon">?</span>
        <div>
          <b>Lost a temporary password?</b>
          <p>
            Open the leader’s account → Password & access → Generate replacement
            password. Email and phone accounts use the same secure handover.
          </p>
        </div>
      </aside>
      {mode === "manage" && selected && (
        <AccountDialog
          title={selected.name}
          subtitle={selected.email || selected.phone || "Leadership account"}
          busy={busy}
          onClose={close}
        >
          <div className="la-account-meta">
            <span
              className={
                "la-status " + (selected.suspended ? "is-suspended" : "")
              }
            >
              {selected.suspended ? "Suspended" : "Active"}
            </span>
            <span>
              {selected.lastSignIn
                ? "Last sign-in: " +
                  new Date(selected.lastSignIn).toLocaleDateString("en-NG", {
                    timeZone: "Africa/Lagos",
                  })
                : "Not yet signed in"}
            </span>
          </div>
          <div className="la-tabs la-detail-tabs">
            <button
              aria-pressed={detailTab === "roles"}
              onClick={() => setDetailTab("roles")}
            >
              Roles & assignments
            </button>
            <button
              aria-pressed={detailTab === "security"}
              onClick={() => setDetailTab("security")}
            >
              Password & access
            </button>
          </div>
          {detailTab === "roles" ? (
            <>
              <div className="la-section-heading">
                <div>
                  <h3>Current assignments</h3>
                  <p>Change one role without affecting the others.</p>
                </div>
                <button
                  className="la-subtle"
                  disabled={selected.user_id === actorId}
                  onClick={() => openAction("add_role", selected)}
                >
                  + Add role
                </button>
              </div>
              {assignments.map((x) => (
                <div className="la-assignment" key={x.id}>
                  <div>
                    <b>{titles[x.role]}</b>
                    <span>{scope(x)}</span>
                  </div>
                  <div>
                    <button
                      className="la-subtle"
                      disabled={selected.user_id === actorId}
                      onClick={() => openAction("replace_role", x)}
                    >
                      Reassign
                    </button>
                    <button
                      className="la-text-danger"
                      disabled={selected.user_id === actorId}
                      onClick={() => openAction("remove_role", x)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="la-security-options">
              <section>
                <div>
                  <h3>Temporary password</h3>
                  <p>
                    Generate a new password if the previous one was lost. The
                    old password is replaced and a personal password is required
                    at sign-in.
                  </p>
                </div>
                {admin && selected.user_id !== actorId ? (
                  <button
                    className="la-primary"
                    disabled={selected.suspended || selected.needsPhoneRepair}
                    onClick={() => openAction("password", selected)}
                  >
                    Generate replacement password
                  </button>
                ) : (
                  <p className="la-hint">
                    {selected.user_id === actorId
                      ? "Use Forgot your password on the sign-in page, or ask another church administrator."
                      : "Ask a church administrator to replace a password."}
                  </p>
                )}
              </section>
              {selected.needsPhoneRepair && (
                <section>
                  <div>
                    <h3>Phone login repair</h3>
                    <p>
                      Keep the existing password and roles while repairing this
                      older phone login.
                    </p>
                  </div>
                  {admin && (
                    <button
                      className="la-subtle"
                      onClick={() => openAction("repair", selected)}
                    >
                      Repair phone login
                    </button>
                  )}
                </section>
              )}
              <section>
                <div>
                  <h3>End Home Cell sessions</h3>
                  <p>Require a fresh sign-in to Home Cell Office.</p>
                </div>
                <button
                  className="la-subtle"
                  disabled={selected.user_id === actorId}
                  onClick={() => openAction("logout", selected)}
                >
                  End sessions
                </button>
              </section>
              <section>
                <div>
                  <h3>
                    {selected.suspended ? "Restore access" : "Pause access"}
                  </h3>
                  <p>
                    {selected.suspended
                      ? "Allow this leader to sign in again."
                      : "Suspend Home Cell access while retaining their roles and records."}
                  </p>
                </div>
                <button
                  className={
                    selected.suspended ? "la-subtle" : "la-text-danger"
                  }
                  disabled={selected.user_id === actorId}
                  onClick={() =>
                    openAction(
                      selected.suspended ? "reactivate" : "suspend",
                      selected,
                    )
                  }
                >
                  {selected.suspended ? "Reactivate account" : "Suspend access"}
                </button>
              </section>
            </div>
          )}
          {selected.user_id === actorId && (
            <p className="la-hint">
              Your own access is protected. Ask another administrator to change
              it.
            </p>
          )}
        </AccountDialog>
      )}
      {mode === "create" && (
        <AccountDialog
          title="Add a leader"
          subtitle="Create access or reuse an existing church account."
          onClose={close}
          busy={busy}
        >
          <ol className="la-stepper">
            <li className={step === 0 ? "current" : "complete"}>
              <span>1</span> Contact details
            </li>
            <li className={step === 1 ? "current" : ""}>
              <span>2</span> Role & access
            </li>
          </ol>
          <form className="la-form" onSubmit={submit} noValidate>
            {step === 0 ? (
              <>
                <label>
                  Full name
                  <input
                    maxLength={160}
                    value={form.full_name}
                    onChange={(e) =>
                      setForm({ ...form, full_name: e.target.value })
                    }
                    placeholder="Leader’s full name"
                    autoComplete="name"
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    maxLength={254}
                    required={!form.phone}
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="name@gmail.com"
                    autoComplete="email"
                  />
                </label>
                <label>
                  Phone number
                  <input
                    type="tel"
                    maxLength={40}
                    required={!form.email}
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    placeholder="08012345678"
                    autoComplete="tel"
                  />
                </label>
                <div className="la-note">
                  <b>Email, phone, or both</b>
                  <p>
                    New accounts receive a generated temporary password.
                    Existing accounts keep their current password. A Gmail
                    address does not mean the leader should use their Gmail
                    password here.
                  </p>
                </div>
              </>
            ) : (
              <>
                {roleFields}
                <div className="la-review">
                  <small>ACCESS SUMMARY</small>
                  <b>{form.full_name || form.email || form.phone}</b>
                  <span>{form.email || form.phone}</span>
                  <p>
                    {titles[form.role]} · {reviewScope}
                  </p>
                </div>
                <p className="la-hint">
                  If this contact already has an account, we’ll ask you to
                  confirm before adding the role. No existing password is
                  overwritten.
                </p>
              </>
            )}
            <footer className="la-dialog-actions">
              <button
                type="button"
                className="la-subtle"
                disabled={busy}
                onClick={() => (step ? setStep(0) : close())}
              >
                {step ? "Back" : "Cancel"}
              </button>
              <button className="la-primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : step
                    ? "Create / assign leader"
                    : "Continue to role"}
              </button>
            </footer>
          </form>
        </AccountDialog>
      )}
      {mode &&
        [
          "add_role",
          "replace_role",
          "remove_role",
          "logout",
          "suspend",
          "reactivate",
          "repair",
          "password",
        ].includes(mode) &&
        selected && (
          <AccountDialog
            title={actionTitle}
            subtitle={
              selected.name +
              " · " +
              (selected.email || selected.phone || "Leadership account")
            }
            busy={busy}
            onClose={close}
          >
            <form className="la-form" onSubmit={submit} noValidate>
              {(mode === "add_role" || mode === "replace_role") && (
                <>
                  {mode === "replace_role" && (
                    <div className="la-note">
                      <small>CURRENT ASSIGNMENT</small>
                      <b>
                        {titles[selected.role]} · {scope(selected)}
                      </b>
                      <p>
                        Only this assignment will be replaced. Other roles stay
                        in place.
                      </p>
                    </div>
                  )}
                  {roleFields}
                  <div className="la-review">
                    <small>
                      {mode === "replace_role"
                        ? "NEW ASSIGNMENT"
                        : "ADDITIONAL ASSIGNMENT"}
                    </small>
                    <b>{titles[form.role]}</b>
                    <span>{reviewScope}</span>
                  </div>
                </>
              )}
              {mode === "password" && (
                <div className="la-note la-note-warning">
                  <b>A new password replaces the old one.</b>
                  <p>
                    This changes their church dashboard password, including
                    Member Care if they use the same account. It does not change
                    their Gmail password. Home Cell sessions will end; they must
                    choose a new password at sign-in.
                  </p>
                  <p>
                    If a request is interrupted, wait 90 seconds before
                    generating another replacement.
                  </p>
                </div>
              )}
              {mode === "remove_role" && (
                <div className="la-note la-note-warning">
                  <b>
                    {titles[selected.role]} · {scope(selected)}
                  </b>
                  <p>
                    This role will be archived. Other assignments and historical
                    reports remain. If it is their last role, Home Cell access
                    ends.
                  </p>
                </div>
              )}
              {mode === "logout" && (
                <p>
                  End this leader’s current Home Cell sessions. Their roles and
                  password stay unchanged.
                </p>
              )}
              {mode === "suspend" && (
                <p>
                  This leader will lose Home Cell access until reactivated.
                  Their roles and records are retained.
                </p>
              )}
              {mode === "reactivate" && (
                <p>
                  Restore this leader’s Home Cell access using their existing
                  roles.
                </p>
              )}
              {mode === "repair" && (
                <p>
                  Repair the phone username without changing their password or
                  assignments.
                </p>
              )}
              <label>
                Reason for this change
                <textarea
                  required
                  minLength={5}
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    mode === "password"
                      ? "For example: temporary password was not saved"
                      : "Add a short explanation for the activity log"
                  }
                  rows={3}
                />
              </label>
              {mode === "password" && (
                <label className="la-checkbox">
                  <input
                    type="checkbox"
                    required
                    checked={shared}
                    onChange={(e) => setShared(e.target.checked)}
                  />
                  <span>
                    I confirm this leader needs a replacement, and I understand
                    their shared church dashboard password will change.
                  </span>
                </label>
              )}
              <footer className="la-dialog-actions">
                <button
                  type="button"
                  className="la-subtle"
                  disabled={busy}
                  onClick={() => {
                    setMode("manage");
                    setDetailTab(
                      mode === "password" || mode === "repair"
                        ? "security"
                        : "roles",
                    );
                  }}
                >
                  Back to account
                </button>
                <button
                  className={
                    mode === "remove_role" || mode === "suspend"
                      ? "la-danger"
                      : "la-primary"
                  }
                  disabled={busy}
                >
                  {busy
                    ? "Saving…"
                    : mode === "password"
                      ? "Generate temporary password"
                      : mode === "replace_role"
                        ? "Save reassignment"
                        : mode === "add_role"
                          ? "Add role"
                          : actionTitle}
                </button>
              </footer>
            </form>
          </AccountDialog>
        )}
      {mode === "credentials" && credentials && (
        <AccountDialog
          title="Login details are ready"
          subtitle="Copy or download before closing this window."
          busy={busy || !acknowledged}
          onClose={close}
        >
          <div className="la-credential-success">
            <span>✓</span>
            <div>
              <b>Ready for a secure handover</b>
              <p>
                The leader must choose a personal password at first sign-in.
              </p>
            </div>
          </div>
          {credentials.warning && (
            <p className="la-note la-note-warning">{credentials.warning}</p>
          )}
          <div className="la-form">
            <label>
              Login
              <input readOnly value={credentials.login} />
            </label>
            <label>
              Temporary password
              <div className="la-password-field">
                <input
                  aria-label="Temporary password"
                  readOnly
                  type={revealed ? "text" : "password"}
                  value={credentials.password}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="la-subtle"
                  aria-pressed={revealed}
                  onClick={() => setRevealed(!revealed)}
                >
                  {revealed ? "Hide" : "Show"}
                </button>
              </div>
            </label>
          </div>
          <div className="la-credential-actions">
            <button className="la-primary" onClick={() => void copy()}>
              {copied ? "✓ Login details copied" : "Copy login details"}
            </button>
            <button className="la-subtle" onClick={download}>
              Download login slip
            </button>
          </div>
          <p className="la-hint">
            Share privately. Passwords are not saved in this page’s browser
            storage. If these details are lost, a church administrator can
            generate a replacement.
          </p>
          <label className="la-checkbox">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>I have saved the login details for private handover.</span>
          </label>
          <footer className="la-dialog-actions">
            <span className="la-hint">Keep this window open until saved.</span>
            <button
              className="la-primary"
              disabled={!acknowledged || busy}
              onClick={close}
            >
              Done, return to accounts
            </button>
          </footer>
        </AccountDialog>
      )}
      {confirmation && (
        <AccountDialog
          compact
          title="Use the existing account?"
          subtitle="No duplicate account will be created."
          busy={busy}
          onClose={() => setConfirmation(null)}
        >
          <div className="la-note">
            <b>{confirmation.identity}</b>
            <p>{confirmation.message}</p>
          </div>
          <footer className="la-dialog-actions">
            <button
              className="la-subtle"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Go back
            </button>
            <button
              className="la-primary"
              disabled={busy}
              onClick={() => {
                const c = confirmation;
                setConfirmation(null);
                void request(c.url, { ...c.payload, confirm_existing: true });
              }}
            >
              Use existing account
            </button>
          </footer>
        </AccountDialog>
      )}
      {popup && (
        <AccountDialog
          compact
          title={popup.title}
          onClose={() => setPopup(null)}
        >
          <div
            className={"la-notification " + popup.kind}
            role={popup.kind === "error" ? "alert" : "status"}
          >
            <span>{popup.kind === "error" ? "!" : "✓"}</span>
            <p>{popup.message}</p>
          </div>
          <footer className="la-dialog-actions">
            <button className="la-primary" onClick={() => setPopup(null)}>
              {popup.kind === "error" ? "Got it" : "Done"}
            </button>
          </footer>
        </AccountDialog>
      )}
    </div>
  );
}
