"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { mountThemeToggle } from "@/lib/theme.js";
import type { StaffIdentity } from "@/lib/auth/types";
import MemberCarePanels from "./MemberCarePanels";
import GuestDesk from "./GuestDesk";
import {
  MEMBER_STATUSES,
  todayInLagos,
  validateMemberDraft,
  type MemberDraft,
  type MemberRecord,
  type FieldErrors,
} from "@/lib/members/model";

const navigation = [
  ["overview", "Overview"],
  ["members", "Members"],
  ["guests", "Guest submissions"],
  ["celebrations", "Celebrations"],
  ["programmes", "Programmes"],
  ["campaigns", "Campaigns"],
  ["newsletters", "Newsletters"],
  ["templates", "Templates"],
  ["automations", "Automations"],
  ["delivery", "Delivery log"],
  ["settings", "Settings"],
];
const roleLabels = {
  administrator: "Administrator",
  editor: "Editor",
  viewer: "Viewer",
      followup_worker: "Follow-up Worker",
};
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    members:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    followups: "M20 6L9 17l-5-5 M3 3h18v18H3z",
    celebrations:
      "M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8H8a3 3 0 1 1 3-3z M12 8h4a3 3 0 1 0-3-3z",
    programmes: "M3 5h18v16H3z M7 3v4 M17 3v4 M3 11h18",
    campaigns: "M3 11v4h4l9 4V7l-9 4z M7 15v6",
    newsletters: "M3 4h18v16H3z M7 8h10 M7 12h10 M7 16h6",
    templates: "M5 3h10l4 4v14H5z M14 3v5h5 M9 12h6 M9 16h6",
    automations: "M13 2L3 14h8l-1 8 11-12h-8z",
    delivery: "M3 5h18v14H3z M3 5l9 7 9-7",
    settings:
      "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.members} />
    </svg>
  );
}
function initials(member: { first: string; last: string }) {
  return (member.first[0] || "") + (member.last[0] || "");
}
function dateLabel(date: string) {
  return date
    ? new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not set";
}
function milestoneLabel(date: string) {
  return date
    ? Number(date.slice(3)) + " " + months[Number(date.slice(0, 2)) - 1]
    : "Not set";
}
function Status({ value }: { value: MemberDraft["status"] }) {
  return (
    <span
      className={
        "badge " +
        (value === "member" ? "green" : value === "visitor" ? "amber" : "blue")
      }
    >
      {MEMBER_STATUSES[value]}
    </span>
  );
}
type PageData = {
  members: MemberRecord[];
  total: number;
  page: number;
  pageSize: number;
};
class MemberRequestError extends Error {
  constructor(
    message: string,
    public fields: FieldErrors = {},
  ) {
    super(message);
  }
}

export default function MemberDesk({
  staff,
  memberId,
  guestMode = false,
  guestId,
}: {
  staff: StaffIdentity;
  memberId?: string;
  guestMode?: boolean;
  guestId?: string;
}) {
  const root = useRef<HTMLDivElement>(null),
    main = useRef<HTMLElement>(null);
  const [identity, setIdentity] = useState(staff),
    [menuOpen, setMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sessionProblem, setSessionProblem] = useState(false),
    [signingOut, setSigningOut] = useState(false);
  const [pageData, setPageData] = useState<PageData | null>(null),
    [member, setMember] = useState<MemberRecord | null>(null);
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [scope, setScope] = useState("active");
  const [careMessage, setCareMessage] = useState("");
  const [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [editor, setEditor] = useState<{ member?: MemberRecord } | null>(null),
    [saved, setSaved] = useState<MemberRecord | null>(null);
  const sessionCheck = useRef<Promise<void> | null>(null);
  const canEdit = identity.role !== "viewer";
  const endSession = useCallback((signedOut = false) => {
    setPageData(null);
    setMember(null);
    setEditor(null);
    if (root.current) {
      root.current.inert = true;
      root.current.style.visibility = "hidden";
    }
    window.location.replace(
      signedOut
        ? "/access"
        : "/access?reason=expired&next=" +
            encodeURIComponent(window.location.pathname),
    );
  }, []);
  const verify = useCallback(async () => {
    if (sessionCheck.current) return sessionCheck.current;
    sessionCheck.current = (async () => {
      try {
        const response = await fetch("/api/auth/session", {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        if (response.status === 401 || response.status === 403)
          return endSession();
        if (!response.ok) {
          setSessionProblem(true);
          return;
        }
        const data = await response.json();
        if (data.staff.user_id !== staff.user_id) {
          window.location.reload();
          return;
        }
        setIdentity(data.staff);
        setSessionProblem(false);
        if (data.staff.role === "viewer") setEditor(null);
      } catch {
        setSessionProblem(true);
      } finally {
        sessionCheck.current = null;
      }
    })();
    return sessionCheck.current;
  }, [endSession, staff.user_id]);
  useEffect(() => {
    setHydrated(true);
    const disposeTheme = root.current
      ? mountThemeToggle(root.current)
      : () => {};
    const focus = () => {
      void verify();
    };
    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void verify();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void verify();
    }, 60000);
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", pageShow);
    window.addEventListener("keydown", key);
    return () => {
      disposeTheme();
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", pageShow);
      window.removeEventListener("keydown", key);
    };
  }, [verify]);
  useEffect(() => {
    if (
      !memberId &&
      !guestMode &&
      canEdit &&
      new URLSearchParams(window.location.search).get("add") === "1"
    )
      setEditor({});
  }, [memberId, guestMode, canEdit]);
  const request = useCallback(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      const response = await fetch(path, {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
        signal: options.signal || AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json", ...options.headers },
      });
      if (response.status === 401) endSession();
      if (response.status === 403) void verify();
      const data = await response.json();
      if (!response.ok)
        throw new MemberRequestError(
          data.message || "We could not complete this request.",
          data.errors || {},
        );
      return data as T;
    },
    [endSession, verify],
  );
  useEffect(() => {
    if (guestMode) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setPageData(null);
    setMember(null);
    const url = memberId
      ? "/api/members/" + memberId + "?includeArchived=1"
      : "/api/members?" +
        new URLSearchParams({ page: String(page), q: query, status, scope });
    void request<PageData | { member: MemberRecord }>(url, {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        if ("members" in data) setPageData(data);
        else setMember(data.member);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof MemberRequestError
              ? error.message
              : "We cannot load members right now. Check your connection and try again.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [guestMode, memberId, page, query, status, scope, refresh, request]);
  async function logout() {
    setSigningOut(true);
    try {
      await request("/api/auth/logout", { method: "POST" });
      endSession(true);
    } catch {
      setSigningOut(false);
      setError("Sign-out could not complete. Please try again.");
    }
  }
  function onSaved(record: MemberRecord) {
    setEditor(null);
    setSaved(record);
    if (memberId) setMember(record);
    else {
      setPage(1);
      setRefresh((v) => v + 1);
    }
    main.current?.focus({ preventScroll: true });
  }
  const nameInitials = identity.display_name
    .split(/\s+/)
    .slice(0, 2)
    .map((v) => v[0] || "")
    .join("")
    .toUpperCase();
  return (
    <div ref={root} id="member-desk">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="demo-bar">
        <span>MEMBER RECORDS ACTIVE</span>
        <p>
          Records are saved · Messaging is paused · Other modules are previews
        </p>
        <a href="/guide">Review guide</a>
      </div>
      <div className="app-shell">
        {menuOpen && (
          <button
            type="button"
            className="member-nav-shade"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <aside
          className={"sidebar " + (menuOpen ? "open" : "")}
          id="sidebar"
          aria-label="Primary navigation"
        >
          <a className="brand" href="/overview">
            <span className="logo-box">
              <img
                src="/assets/image-7d4e31b34082.png"
                alt="Vine Branch Church"
              />
            </span>
            <span>
              VINE BRANCH<small>Member care</small>
            </span>
          </a>
          <p className="nav-label">CHURCH OFFICE</p>
          <nav id="navigation" aria-label="Care modules">
            {navigation.map(([path, label]) => (
              <a
                key={path}
                href={"/" + path}
                className={
                  "nav-item " +
                  (path === (guestMode ? "guests" : "members") ? "active" : "")
                }
                aria-current={
                  path === (guestMode ? "guests" : "members")
                    ? "page"
                    : undefined
                }
              >
                <Icon name={path} />
                {label}
              </a>
            ))}
          </nav>
          <div className="side-bottom">
            <a href="/followups">Follow-up assignments →</a>
            <a href="/join">
              <span className="side-mark">+</span> Visitor experience
            </a>
            <a href="/budget">
              <span className="side-mark">₦</span> Budget & references
            </a>
            <div className="office-user">
              <span className="avatar small">{nameInitials}</span>
              <span className="staff-name">
                {identity.display_name}
                <small>{roleLabels[identity.role]} · Signed in</small>
              </span>
              <button
                type="button"
                className="staff-logout"
                disabled={signingOut || !hydrated}
                onClick={() => void logout()}
              >
                {signingOut ? "Leaving…" : "Sign out"}
              </button>
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <button
              type="button"
              className="icon-button menu-button"
              id="menu-toggle"
              aria-controls="sidebar"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              disabled={!hydrated}
              onClick={() => setMenuOpen((v) => !v)}
            >
              ☰
            </button>
            <span className="breadcrumb">
              Church office / {guestMode ? "Guest submissions" : "Members"}
              {memberId ? " / Profile" : guestId ? " / Review" : ""}
            </span>
            <div className="top-actions">
              <button
                type="button"
                className="theme-toggle icon-button"
                id="theme-toggle"
                aria-label="Switch to light mode"
                aria-pressed="true"
                disabled={!hydrated}
              >
                <span>Light mode</span>
              </button>
              <a className="vbc-followup-shortcut" href="/followups" aria-label="Open Follow-ups workspace"><span aria-hidden="true">◎</span> Follow-ups <span aria-hidden="true">↗</span></a>
              <span className="time-zone">Africa / Lagos</span>
              <a className="text-link" href="/guide">
                Screen guide
              </a>
              <span className="avatar small">{nameInitials}</span>
            </div>
          </header>
          <main id="main" ref={main} tabIndex={-1}>
            {sessionProblem ? (
              <section className="card">
                <div className="card-pad" role="alert">
                  <h1>Checking staff access</h1>
                  <p className="mt">
                    We cannot verify your access right now. Check your
                    connection, then try again.
                  </p>
                  <button
                    type="button"
                    className="btn mt"
                    onClick={() => void verify()}
                  >
                    Try again
                  </button>
                </div>
              </section>
            ) : (
              <>
                {careMessage && (
                  <div className="notice member-save-notice" role="status">
                    {careMessage}
                  </div>
                )}
                {saved && (
                  <div className="notice member-save-notice" role="status">
                    <strong>
                      Saved {saved.first} {saved.last}.
                    </strong>
                    <span>Your record will remain after a refresh.</span>
                    <a className="text-link" href={"/profile/" + saved.id}>
                      View saved profile →
                    </a>
                  </div>
                )}
                {guestMode ? (
                  <GuestDesk
                    request={request}
                    canEdit={canEdit}
                    guestId={guestId}
                  />
                ) : memberId ? (
                  <>
                    <div className="mb">
                      <a href="/members" className="text-link">
                        ← All members
                      </a>
                    </div>
                    {!loading && member && (
                      <MemberProfile
                        member={member}
                        canEdit={canEdit && !member.archivedAt}
                        onEdit={() => setEditor({ member })}
                      />
                    )}
                    {!loading && member && (
                      <MemberCarePanels
                        member={member}
                        canEdit={canEdit}
                        request={request}
                        onChanged={(message, record) => {
                          setCareMessage(message);
                          setSaved(null);
                          if (record) setMember(record);
                          else setRefresh((v) => v + 1);
                        }}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <div className="page-head">
                      <div>
                        <div className="eyebrow">Member care</div>
                        <h1>The church family</h1>
                        <p>
                          A lasting record of every person, their milestones and
                          preferences.
                        </p>
                      </div>
                      <div className="actions">
                        {canEdit ? (
                          <button
                            type="button"
                            className="btn primary"
                            disabled={!hydrated || loading}
                            onClick={() => setEditor({})}
                          >
                            ＋ Add member
                          </button>
                        ) : (
                          <span className="badge blue">View access</span>
                        )}
                      </div>
                    </div>
                    <form
                      className="toolbar"
                      onSubmit={(event) => {
                        event.preventDefault();
                        setPage(1);
                        setQuery(search.trim());
                      }}
                    >
                      <label className="searchbox">
                        <span className="sr-only">
                          Search by given name, surname, email or phone
                        </span>
                        <Icon name="search" />
                        <input
                          type="search"
                          disabled={!hydrated}
                          value={search}
                          maxLength={120}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Search by name, email or phone"
                        />
                      </label>
                      <button
                        className="btn"
                        type="submit"
                        disabled={!hydrated}
                      >
                        Search
                      </button>
                      <select
                        aria-label="Filter archive status"
                        disabled={!hydrated}
                        value={scope}
                        onChange={(event) => {
                          setScope(event.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="active">Active directory</option>
                        <option value="archived">Archived members</option>
                      </select>
                      <select
                        aria-label="Filter membership"
                        disabled={!hydrated}
                        value={status}
                        onChange={(event) => {
                          setStatus(event.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="all">All members</option>
                        {Object.entries(MEMBER_STATUSES).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                      <button
                        type="button"
                        className="btn"
                        disabled={!hydrated}
                        onClick={() => {
                          setSearch("");
                          setQuery("");
                          setStatus("all");
                          setScope("active");
                          setPage(1);
                          setRefresh((v) => v + 1);
                        }}
                      >
                        Reset
                      </button>
                    </form>
                    {!loading && pageData && (
                      <section className="card">
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Member</th>
                                <th>Status</th>
                                <th>Birthday</th>
                                <th>Anniversary</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {pageData.members.map((record) => (
                                <tr key={record.id}>
                                  <td>
                                    <div className="name-cell">
                                      <span className="avatar">
                                        {initials(record)}
                                      </span>
                                      <div>
                                        <a
                                          className="text-link"
                                          href={"/profile/" + record.id}
                                        >
                                          {record.first} {record.last}
                                        </a>
                                        <small>
                                          {record.email || record.phone}
                                        </small>
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <Status value={record.status} />
                                    {record.archivedAt && (
                                      <span className="badge amber">
                                        Archived
                                      </span>
                                    )}
                                  </td>
                                  <td>{milestoneLabel(record.birthday)}</td>
                                  <td>{milestoneLabel(record.anniversary)}</td>
                                  <td>
                                    <a
                                      className="text-link"
                                      href={"/profile/" + record.id}
                                    >
                                      View profile
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {!pageData.members.length && (
                          <div className="list-empty">
                            <div className="empty-symbol">♡</div>
                            <h2>
                              {pageData.total ||
                              query ||
                              status !== "all" ||
                              scope === "archived"
                                ? "No members match this view"
                                : "Let’s remember your first member"}
                            </h2>
                            <p className="hint mt">
                              {query || status !== "all" || scope === "archived"
                                ? "Try another search or reset your filters."
                                : "Add a member to begin your saved church directory."}
                            </p>
                            {canEdit &&
                              !query &&
                              status === "all" &&
                              scope === "active" && (
                                <button
                                  type="button"
                                  className="btn primary mt"
                                  onClick={() => setEditor({})}
                                >
                                  Add the first member
                                </button>
                              )}
                          </div>
                        )}
                        <div className="table-bottom member-pagination">
                          <span>
                            {pageData.total
                              ? `${(pageData.page - 1) * pageData.pageSize + 1}–${Math.min(pageData.page * pageData.pageSize, pageData.total)} of ${pageData.total}`
                              : "0"}{" "}
                            saved records
                          </span>
                          <div className="actions">
                            <button
                              type="button"
                              className="btn small"
                              disabled={page === 1}
                              onClick={() => setPage((v) => v - 1)}
                            >
                              Previous
                            </button>
                            <span>Page {pageData.page}</span>
                            <button
                              type="button"
                              className="btn small"
                              disabled={
                                page * pageData.pageSize >= pageData.total
                              }
                              onClick={() => setPage((v) => v + 1)}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      </section>
                    )}
                  </>
                )}
                {loading && (
                  <section className="card">
                    <div className="card-pad" role="status">
                      <h2>Opening the member directory…</h2>
                      <p className="hint mt">Loading your saved records.</p>
                    </div>
                  </section>
                )}
                {error && (
                  <section className="notice red" role="alert">
                    <strong>{error}</strong>
                    <div className="mt">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setRefresh((v) => v + 1)}
                      >
                        Reload records
                      </button>
                    </div>
                  </section>
                )}
              </>
            )}
          </main>
          <footer className="app-footer">
            <span>Vine Branch Church · Member care</span>
            <span>Member records · Saved directory</span>
          </footer>
        </div>
      </div>
      {editor && canEdit && !sessionProblem && (
        <MemberEditor
          member={editor.member}
          request={request}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function MemberProfile({
  member,
  canEdit,
  onEdit,
}: {
  member: MemberRecord;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const Detail = ({
    label,
    children,
  }: {
    label: string;
    children: ReactNode;
  }) => (
    <div>
      <dt>{label}</dt>
      <dd>{children || "Not set"}</dd>
    </div>
  );
  return (
    <>
      <div className="profile-hero">
        <span className="avatar large">{initials(member)}</span>
        <div>
          <div className="eyebrow">Saved member profile</div>
          <h1>
            {member.first} {member.last}
          </h1>
          <div className="mt">
            <Status value={member.status} />
            {member.archivedAt && (
              <span className="badge amber">Archived · Read only</span>
            )}
          </div>
        </div>
        <div className="actions">
          {canEdit && (
            <button type="button" className="btn primary" onClick={onEdit}>
              Edit profile
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => window.location.reload()}
          >
            Reload profile
          </button>
        </div>
      </div>
      <div className="grid two member-contact-grid">
        <div className="grid">
          <section className="card">
            <div className="card-head">
              <h2>Contact information</h2>
            </div>
            <div className="card-pad">
              <dl className="detail-list">
                <Detail label="Other names">{member.first}</Detail>
                <Detail label="Surname">{member.last}</Detail>
                <Detail label="Email">{member.email}</Detail>
                <Detail label="Mobile number">{member.phone}</Detail>
                <Detail label="Occupation">{member.occupation}</Detail>
                <Detail label="First visit / joined">
                  {dateLabel(member.joined)}
                </Detail>
                <div className="span-two">
                  <dt>Residential address</dt>
                  <dd>{member.address || "Not set"}</dd>
                </div>
              </dl>
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Important dates</h2>
            </div>
            <div className="card-pad">
              <dl className="detail-list">
                <Detail label="Birthday">
                  {milestoneLabel(member.birthday)}
                </Detail>
                <Detail label="Wedding anniversary">
                  {milestoneLabel(member.anniversary)}
                </Detail>
              </dl>
              <p className="help-text">
                Only month and day are recorded for greetings.
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function MemberEditor({
  member,
  request,
  onClose,
  onSaved,
}: {
  member?: MemberRecord;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  onClose: () => void;
  onSaved: (record: MemberRecord) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    errorsBox = useRef<HTMLDivElement>(null);
  const requestId = useRef("");
  const [draft, setDraft] = useState<MemberDraft>(
    member
      ? {
          first: member.first,
          last: member.last,
          email: member.email,
          phone: member.phone,
          status: member.status,
          occupation: member.occupation,
          address: member.address,
          birthday: member.birthday,
          anniversary: member.anniversary,
          joined: member.joined,
        }
      : {
          first: "",
          last: "",
          email: "",
          phone: "",
          status: "visitor",
          occupation: "",
          address: "",
          birthday: "",
          anniversary: "",
          joined: todayInLagos(),
        },
  );
  const [fields, setFields] = useState<FieldErrors>({}),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  useEffect(() => {
    requestId.current = crypto.randomUUID();
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
    };
  }, []);
  useEffect(() => {
    if (message || Object.keys(fields).length) errorsBox.current?.focus();
  }, [message, fields]);
  function change(key: keyof MemberDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const validation = validateMemberDraft(draft);
    setFields({});
    setMessage("");
    if (!validation.ok) {
      setFields(validation.errors);
      setMessage("Check the highlighted fields.");
      return;
    }
    setPending(true);
    try {
      const payload = member
        ? { ...validation.value, expectedVersion: member.version }
        : { ...validation.value, requestId: requestId.current };
      const result = await request<{ member: MemberRecord }>(
        member ? "/api/members/" + member.id : "/api/members",
        { method: member ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      onSaved(result.member);
    } catch (error) {
      setFields(error instanceof MemberRequestError ? error.fields : {});
      setMessage(
        error instanceof MemberRequestError
          ? error.message
          : "We could not confirm the save. Your details are still here; check your connection before retrying.",
      );
      setPending(false);
    }
  }
  function input(
    key: keyof MemberDraft,
    label: string,
    type = "text",
    maxLength?: number,
    required = false,
  ) {
    return (
      <div className="field">
        <label htmlFor={"record-" + key}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
        <input
          id={"record-" + key}
          name={key}
          type={type}
          value={draft[key]}
          maxLength={maxLength}
          required={required}
          disabled={pending}
          aria-invalid={!!fields[key]}
          aria-describedby={fields[key] ? "error-" + key : undefined}
          onChange={(event) => change(key, event.target.value)}
        />
        {fields[key] && (
          <small id={"error-" + key} className="member-field-error">
            {fields[key]}
          </small>
        )}
      </div>
    );
  }
  function milestone(key: "birthday" | "anniversary", label: string) {
    const [month = "", day = ""] = draft[key].split("-");
    return (
      <fieldset className="member-milestone">
        <legend>{label}</legend>
        <div className="member-date-pair">
          <label>
            <span className="sr-only">{label} month</span>
            <select
              id={"record-" + key}
              value={month}
              disabled={pending}
              aria-invalid={!!fields[key]}
              aria-describedby={fields[key] ? "error-" + key : undefined}
              onChange={(event) =>
                change(
                  key,
                  event.target.value ? event.target.value + "-" + day : "",
                )
              }
            >
              <option value="">Month</option>
              {months.map((name, i) => (
                <option key={name} value={String(i + 1).padStart(2, "0")}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">{label} day</span>
            <input
              type="number"
              placeholder="Day"
              min="1"
              max="31"
              value={day ? Number(day) : ""}
              disabled={pending}
              aria-invalid={!!fields[key]}
              onChange={(event) =>
                change(
                  key,
                  month +
                    "-" +
                    (event.target.value
                      ? event.target.value.padStart(2, "0")
                      : ""),
                )
              }
            />
          </label>
        </div>
        {fields[key] && (
          <small id={"error-" + key} className="member-field-error">
            {fields[key]}
          </small>
        )}
      </fieldset>
    );
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="member-editor-title"
      className="member-editor"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id="member-editor-title">
          {member ? "Edit member" : "Add member"}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close member form"
          disabled={pending}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <form
        id="saved-member-form"
        className="modal-body"
        noValidate
        onSubmit={save}
        aria-busy={pending}
      >
        {(message || Object.keys(fields).length > 0) && (
          <div
            ref={errorsBox}
            className="notice red mb"
            role="alert"
            tabIndex={-1}
          >
            <strong>{message}</strong>
            {Object.keys(fields).length > 0 && (
              <ul>
                {Object.entries(fields).map(([key, value]) => (
                  <li key={key}>
                    <a
                      href={"#record-" + key}
                      onClick={(event) => {
                        event.preventDefault();
                        dialog.current
                          ?.querySelector<HTMLElement>("#record-" + key)
                          ?.focus();
                      }}
                    >
                      {value}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="form-grid">
          {input("first", "Other names", "text", 120, true)}
          {input("last", "Surname", "text", 100, true)}
          {input("email", "Email", "email", 254)}
          {input("phone", "Mobile number", "tel", 50)}
          <div className="field">
            <label htmlFor="record-status">Membership</label>
            <select
              id="record-status"
              value={draft.status}
              disabled={pending}
              onChange={(event) => change("status", event.target.value)}
            >
              {Object.entries(MEMBER_STATUSES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {input("joined", "First visit / joined", "date", undefined, true)}
          {input("occupation", "Occupation", "text", 150)}
          <div className="field">
            <label htmlFor="record-address">Residential address</label>
            <input
              id="record-address"
              value={draft.address}
              maxLength={600}
              disabled={pending}
              aria-invalid={!!fields.address}
              onChange={(event) => change("address", event.target.value)}
            />
            {fields.address && (
              <small className="member-field-error">{fields.address}</small>
            )}
          </div>
          {milestone("birthday", "Birthday")}
          {milestone("anniversary", "Wedding anniversary")}
        </div>
        <p className="help-text">
          Record at least one contact method. Nigerian mobile numbers are saved
          with +234. Milestones keep month and day only.
        </p>
        <div className="notice mt">
          Saving these details does not change message permissions. New member records do not establish messaging consent. Review and record channel preferences separately before sending.
        </div>
      </form>
      <div className="modal-foot">
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="btn primary"
          type="submit"
          form="saved-member-form"
          disabled={pending}
        >
          {pending ? "Saving…" : "Save member"}
        </button>
      </div>
    </dialog>
  );
}
