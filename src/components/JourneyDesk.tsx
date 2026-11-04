"use client";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useId,
  type ReactNode,
  type FormEvent,
} from "react";
import type { StaffIdentity } from "@/lib/auth/types";
import {
  outcomes,
  visitPurposes,
  uuid,
  nextMembershipSunday,
  type JourneySnapshot,
  type JourneyPerson,
  type Entry,
} from "@/lib/journey/model";
import "./journey.css";
import WhatsAppInvitations from "./WhatsAppInvitations";
import CommandPalette from "./CommandPalette";
import FriendDesk from "./FriendDesk";
import JourneyImport from "./JourneyImport";
import FriendAccounts from "./FriendAccounts";
import JourneyCelebrationDates from "./JourneyCelebrationDates";
import JourneyRegister from "./JourneyRegister";
import {
  DirectRegistrationFields,
  IntegrationProfile,
  JourneyReports,
} from "./JourneyExtensions";
const labels: Record<string, string> = {
  overview: "Today",
  register: "People register",
  friends: "Friends & accounts",
  visitors: "Visitors",
  followups: "Contact queue",
  attendance: "Church attendance",
  membership: "Membership Sunday",
  care: "Continuing care",
  cfc: "Foundation classes",
  ministry: "Ministry involvement",
  home_cells: "Home Cell integration",
  reports: "Reports & Friends analysis",
};
const actionNames: Record<string, string> = {
  direct: "Register a person",
  previous_visit: "Record a known previous visit",
  void_previous_visit: "Correct previous-visit confirmation",
  purpose: "Visitor purpose / interest",
  followup_state: "Contact status",
  support: "Record a support need",
  ministry_add: "Add ministry involvement",
  ministry_end: "End ministry assignment",
  assign: "Assign a Follow Through Friend",
  contact: "Log a care outcome",
  attendance: "Record church attendance",
  void_attendance: "Correct attendance",
  review_membership: "Review corrected membership evidence",
  intention: "Membership preparation",
  join: "Confirm official membership",
  legacy_date: "Reconcile historical membership date",
  care_review: "Review continuing care",
  enrol: "Enrol in CFC",
  class_attendance: "Record class attendance",
  complete_cfc: "Confirm CFC completion",
  certificate: "Record certificate award",
  cohort: "Create a CFC cohort",
  policy: "Church journey policy",
  role: "Manage journey access",
};
const pretty = (s: string) => s.replaceAll("_", " ");
const date = (v?: string | null, time = false) =>
  v
    ? new Intl.DateTimeFormat("en-NG", {
        timeZone: "Africa/Lagos",
        dateStyle: "medium",
        ...(time ? { timeStyle: "short" as const } : {}),
      }).format(new Date(v.length === 10 ? v + "T12:00:00Z" : v))
    : "Not recorded";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const localTime = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    ministry: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3m3-15a3 3 0 0 1 0 6m3 9v-3a6 6 0 0 0-3-5" />
      </>
    ),
    home_cells: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Zm6 11v-8h6v8" />
      </>
    ),
    reports: (
      <>
        <path d="M3 3v18h18M7 16v-4m5 4V7m5 9v-7" />
      </>
    ),
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    visitors: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3m3-15a3 3 0 0 1 0 6m3 9v-3a6 6 0 0 0-3-5" />
      </>
    ),
    followups: (
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 1 1 19 0ZM7 9h10M7 13h6" />
    ),
    attendance: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4m10-4v4M3 11h18m-14 5 3 3 6-6" />
      </>
    ),
    membership: (
      <>
        <path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" />
      </>
    ),
    care: (
      <path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1C-1 10 7 18 12 21c5-3 13-11 8-16Z" />
    ),
    cfc: (
      <>
        <path d="m2 8 10-5 10 5-10 5ZM6 10v7c4 3 8 3 12 0v-7m4-2v9" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
      </>
    ),
    moon: <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    settings: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="8" cy="6" r="2" />
        <circle cx="16" cy="12" r="2" />
        <circle cx="9" cy="18" r="2" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    check: <path d="m4 12 5 5L20 6" />,
    phone: (
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    ),
    whatsapp: (
      <>
        <path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.2 3.1Z" />
        <path d="M9 8.5c0 3.5 2.6 6.5 6.5 6.5l1-1.6-2-1-1 .9c-1.2-.5-2.3-1.6-2.8-2.8l.9-1-1-2Z" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || paths.overview}
    </svg>
  );
}
function Dialog({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const d = ref.current!,
      prior = document.activeElement as HTMLElement | null;
    d.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d.close();
      document.body.style.overflow = old;
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  return (
    <dialog
      className="vj-dialog"
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <span className="vj-eyebrow">VINE BRANCH · MEMBER CARE</span>
          <h2 id={id}>{title}</h2>
        </div>
        <button
          className="vj-icon"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="vj-empty">
      <Icon name="care" />
      <p>{children}</p>
    </div>
  );
}
function Badge({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"vj-badge " + tone}>{children}</span>;
}
export default function JourneyDesk({ staff }: { staff: StaffIdentity }) {
  const [snapshot, setSnapshot] = useState<JourneySnapshot | null>(null),
    [view, setView] = useState("overview"),
    [tab, setTab] = useState("journey"),
    [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [stage, setStage] = useState("all"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(""),
    [dark, setDark] = useState(true),
    [menu, setMenu] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [palette, setPalette] = useState(false),
    [importing, setImporting] = useState(false),
    [friendMode, setFriendMode] = useState(true);
  const sequence = useRef(0),
    mounted = useRef(true),
    replay = useRef<{ body: string; id: string } | null>(null),
    formRef = useRef<HTMLFormElement>(null);
  const load = useCallback(async () => {
    const n = ++sequence.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        page: String(page),
        view:
          (view === "overview" && stage === "overdue") ||
          ["register", "friends", "ministry", "home_cells", "reports"].includes(
            view,
          )
            ? "all"
            : view,
        stage,
      });
      if (selected) params.set("memberId", selected);
      const r = await fetch("/api/journey?" + params, {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      const value = await r.json();
      if (!r.ok) throw Error(value.message || "Unable to load the journey.");
      if (mounted.current && n === sequence.current) {
        setSnapshot(value);
        setError("");
      }
    } catch (e) {
      if (mounted.current && n === sequence.current)
        setError(e instanceof Error ? e.message : "Unable to connect.");
    } finally {
      if (mounted.current && n === sequence.current) setLoading(false);
    }
  }, [search, page, view, selected, stage]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current++;
    };
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const sync = () =>
      setDark(document.documentElement.dataset.theme !== "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    function change() {
      const hash = location.hash.slice(1);
      if (Object.hasOwn(labels, hash)) setView(hash);
      setStage("all");
      setPending(null);
      const personId = new URLSearchParams(location.search).get("person");
      setSelected(personId && uuid.test(personId) ? personId : null);
      const profileTab = new URLSearchParams(location.search).get("tab");
      if (profileTab === "integration") setTab("community");
      setPage(0);
    }
    change();
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    try {
      if (localStorage.getItem("vbc-friend-mode") === "off")
        setFriendMode(false);
    } catch {
      /* default to Friend mode */
    }
  }, []);
  function chooseFriendMode(on: boolean) {
    setFriendMode(on);
    try {
      localStorage.setItem("vbc-friend-mode", on ? "on" : "off");
    } catch {
      /* preference only */
    }
  }
  const caps = snapshot?.capabilities,
    detail = snapshot?.detail;
  const person =
    selected && detail?.person.member_id === selected
      ? {
          ...snapshot?.items.find((x) => x.member_id === selected),
          ...detail.person,
        }
      : null;
  const own =
    !!person &&
    (caps?.coordinator ||
      (person.assigned_to === staff.user_id && caps?.friend));
  function navigate(next: string, filter = "all") {
    if (modal || busy) return;
    setSelected(null);
    setView(next);
    setStage(filter);
    setPending(null);
    setPage(0);
    setMenu(false);
    setQuery("");
    setSearch("");
    history.replaceState(null, "", location.pathname + "#" + next);
  }
  function openPerson(id: string, nextTab?: string) {
    setSelected(id);
    history.replaceState(
      null,
      "",
      location.pathname + "?person=" + encodeURIComponent(id) + "#" + view,
    );
    setTab(
      nextTab ||
        (["ministry", "home_cells"].includes(view) ? "community" : "journey"),
    );
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  useEffect(() => {
    if (!pending || modal || !person || !detail) return;
    const next = pending;
    setPending(null);
    setFormError("");
    replay.current = null;
    setModal(next);
  }, [pending, modal, person, detail]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!modal) setPalette(true);
      } else if (e.key === "/" && !typing && !modal && !e.altKey) {
        e.preventDefault();
        setPalette(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);
  function closeProfile() {
    setPending(null);
    setSelected(null);
    history.replaceState(null, "", location.pathname + "#" + view);
  }
  function action(name: string) {
    setFormError("");
    replay.current = null;
    setModal(name);
  }
  function theme() {
    const value = dark ? "light" : "dark";
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem("vbc-care-theme", value);
    } catch {}
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !snapshot) return;
    const form = e.currentTarget,
      values = Object.fromEntries(new FormData(form));
    const data: Record<string, unknown> = { ...values };
    if (person) {
      data.memberId = person.member_id;
      data.version = person.version;
    }
    if (modal === "policy") {
      data.serviceTypes = String(values.serviceTypes || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      data.firstContactHours = Number(values.firstContactHours);
    }
    if (modal === "direct" && !values.existingId) {
      data.contactConsent = values.contactConsent === "true";
      data.emailOptIn = values.emailOptIn === "true";
      data.smsOptIn = values.smsOptIn === "true";
    }
    if (modal === "role") data.enabled = values.enabled === "true";
    for (const key of ["occurredAt", "nextDue"]) {
      if (data[key]) data[key] = new Date(String(data[key])).toISOString();
    }
    const body = JSON.stringify({ action: modal, data });
    if (replay.current?.body !== body)
      replay.current = { body, id: crypto.randomUUID() };
    setBusy(true);
    setFormError("");
    try {
      const r = await fetch("/api/journey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: modal,
          data,
          requestId: replay.current.id,
        }),
        signal: AbortSignal.timeout(25000),
      });
      const response = await r.json();
      if (!r.ok) throw Error(response.message || "Unable to save.");
      setModal(null);
      if (modal === "direct" && response.memberId)
        openPerson(response.memberId);
      setToast("Saved successfully. Your journey history has been retained.");
      await load();
    } catch (e) {
      setFormError(
        (e instanceof Error ? e.message : "Unable to save.") +
          " Your entered details are still here. If the connection was interrupted, retrying these same details is safe.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function signout() {
    if (busy) return;
    try {
      const r = await fetch("/api/auth/logout", { method: "POST" });
      if (!r.ok) throw Error("Unable to sign out. Please try again.");
      location.href = "/access";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign out.");
    }
  }
  const rows = snapshot?.items || [],
    stats = snapshot?.stats || {};
  const overdueCount = stats.overdue || 0,
    unassignedCount = stats.unassigned || 0;
  const canCare = (p: JourneyPerson) =>
    !!caps?.coordinator || (!!caps?.friend && p.assigned_to === staff.user_id);
  function rowActions(p: JourneyPerson) {
    const callable =
      !!p.phone && p.contact_consent && p.followup_state === "active";
    const care = canCare(p);
    if (!callable && !care) return null;
    return (
      <div className="vj-row-actions">
        {callable && (
          <a
            className="vj-secondary vj-square"
            href={"tel:" + p.phone}
            aria-label={"Call " + p.name}
            title={"Call " + p.name}
          >
            <Icon name="phone" />
          </a>
        )}
        {care && p.contact_consent && p.followup_state === "active" && (
          <button
            className="vj-secondary vj-square vj-wa"
            aria-label={"WhatsApp invitation for " + p.name}
            title={"WhatsApp invitation for " + p.name}
            onClick={() => openPerson(p.member_id, "whatsapp")}
          >
            <Icon name="whatsapp" />
          </button>
        )}
        {care && (
          <button
            className="vj-primary"
            onClick={() => {
              openPerson(p.member_id);
              setPending("contact");
            }}
          >
            Log outcome
          </button>
        )}
      </div>
    );
  }
  const field = (
    name: string,
    label: string,
    type = "text",
    required = true,
    initial?: string,
  ) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        maxLength={type === "text" ? 2000 : undefined}
        defaultValue={initial}
        max={
          type === "date" && !["care_review", "cohort"].includes(modal || "")
            ? today()
            : undefined
        }
      />
    </label>
  );
  const select = (
    name: string,
    label: string,
    options: [string, string][],
    initial?: string,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        name={name}
        required
        defaultValue={initial || ""}
      >
        <option value="" disabled>
          Select…
        </option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const notes = (required = false, label = "Care note", initial = "") => (
    <label className="vj-wide">
      {label}
      <textarea
        name="note"
        rows={3}
        maxLength={2000}
        required={required}
        minLength={required ? 5 : undefined}
        defaultValue={initial}
        placeholder="Record what happened, the evidence or the next step."
      />
    </label>
  );
  function forms() {
    if (!snapshot) return null;
    const p = snapshot.policy;
    switch (modal) {
      case "previous_visit":
        return (
          <>
            {field(
              "beforeDate",
              "Known to have visited before this date · not the visit date",
              "date",
              true,
              today(),
            )}
            {select("source", "Confirmation source", [
              ["phone", "Visitor reported by phone"],
              ["whatsapp", "Visitor reported by WhatsApp"],
              ["church_staff", "Church staff confirmation"],
              ["other", "Other"],
            ])}
            {notes(true, "Evidence of a previous VBC church visit")}
            <p className="vj-hint vj-wide">
              Use this only when a previous visit is known but its exact date is
              unknown. This records a dated boundary for the claim, not an
              invented service date. It does not approve same-day first-time
              joining.
            </p>
          </>
        );
      case "void_previous_visit":
        return (
          <>
            {select(
              "visitId",
              "Confirmation to correct",
              (detail?.previous_visits || [])
                .filter((x) => !x.voided_at)
                .map((x) => [x.id, "Known before " + date(x.known_before)]),
            )}
            {notes(true, "Correction reason")}
          </>
        );
      case "direct":
        return <DirectRegistrationFields />;
      case "purpose":
        return (
          <>
            {select(
              "purpose",
              "Visit purpose / interest",
              Object.entries(visitPurposes),
              person?.visit_purpose || "not_specified",
            )}
            {notes(false, "Conversation context · optional")}
            <p className="vj-hint vj-wide">
              Optional classification guides appropriate care. It never prevents
              membership.
            </p>
          </>
        );
      case "followup_state":
        return (
          <>
            {select(
              "state",
              "Contact status",
              [
                ["active", "Visitors receiving care"],
                ["paused", "Paused"],
                ["inactive", "Inactive"],
              ],
              person?.followup_state === "declined_contact"
                ? "paused"
                : person?.followup_state || "active",
            )}
            {notes(true, "Reason for this status")}
            <p className="vj-hint vj-wide">
              Use the no-further-contact outcome to stop all outreach channels.
              Resuming requires recorded contact permission.
            </p>
          </>
        );
      case "support":
        return (
          <>
            {notes(true, "Private welfare / support need")}
            <p className="vj-hint vj-wide">
              Only the assigned friend and Coordinator can read this journal.
              These notes are excluded from standard exports.
            </p>
          </>
        );
      case "ministry_add":
        return (
          <>
            {field("team", "Ministry / activity team")}
            {field("responsibility", "Role / responsibility", "text", false)}
            {field(
              "date",
              "Actual date joined · leave unknown dates blank",
              "date",
              false,
            )}
            {notes(false, "Context · optional")}
          </>
        );
      case "ministry_end":
        return (
          <>
            {select(
              "ministryId",
              "Active assignment",
              (detail?.ministry || [])
                .filter((x) => x.active)
                .map((x) => [x.id, x.team_name + " · " + x.responsibility]),
            )}
            {field("date", "Actual date left", "date", true, today())}
            {notes(true, "Reason for ending this assignment")}
          </>
        );
      case "assign":
        return (
          <>
            {select(
              "worker",
              "Follow Through Friend",
              snapshot.team
                .filter(
                  (t) =>
                    ["administrator", "followup_worker"].includes(t.role) ||
                    t.capabilities.includes("friend"),
                )
                .map((t) => [t.id, t.name]),
              person?.assigned_to || "",
            )}
            <p className="vj-hint vj-wide">
              The new friend receives access immediately. Earlier activity stays
              in the person’s history.
            </p>
          </>
        );
      case "contact":
        return (
          <>
            {select(
              "method",
              "Contact method",
              ["phone", "whatsapp", "sms", "email", "in_person", "other"].map(
                (x) => [x, pretty(x)],
              ),
              "phone",
            )}
            {select(
              "outcome",
              "What happened?",
              Object.entries(outcomes),
              "positive",
            )}
            {field(
              "occurredAt",
              "Actual contact time · your device timezone",
              "datetime-local",
              true,
              localTime(),
            )}
            {field(
              "nextDue",
              "Next contact / callback · your device timezone",
              "datetime-local",
              false,
            )}
            {notes(false)}
            <p className="vj-hint vj-wide">
              A callback requires a next date. “No further contact” means stop
              all outreach channels and pause outreach tasks; record their
              request in the note. Contact outcomes never count as church
              attendance.
            </p>
          </>
        );
      case "attendance":
        return (
          <>
            {field("date", "Actual church service date", "date", true, today())}
            {field("serviceKey", "Service name / session (e.g. main service)")}
            {field(
              "serviceType",
              "Church service type · optional",
              "text",
              false,
              p.service_types[0] || "",
            )}
            {select("source", "Evidence received through", [
              ["phone", "Phone call"],
              ["whatsapp", "WhatsApp"],
              ["church_staff", "Church staff"],
              ["other", "Other"],
            ])}
            {select(
              "verification",
              "Evidence level",
              [
                ["self_report", "Visitor self-report"],
                ["independently_confirmed", "Independently confirmed"],
              ],
              "self_report",
            )}
            {notes(false, "Attendance remarks · optional")}
            <p className="vj-hint vj-wide">
              {p.service_types.length
                ? "Optional service labels: " + p.service_types.join(", ")
                : "Record an actual VBC church visit and its source. The service type can be left unspecified."}{" "}
              Self-reports remain visibly marked for Coordinator review. Only
              one entry per person, date and service type; distinguish separate
              sessions by type. Home Cell and CFC do not count.
            </p>
          </>
        );
      case "review_membership":
        return (
          <>
            {notes(true, "Administrator review and evidence reconciliation")}
            <p className="vj-hint vj-wide">
              Official status stays intact during review. One previous VBC visit
              must remain supported before the actual joining date, except
              reconciled legacy members.
            </p>
          </>
        );
      case "void_attendance":
        return (
          <>
            {select(
              "attendanceId",
              "Entry to correct",
              (detail?.attendance || [])
                .filter((x) => !x.voided_at)
                .map((x) => [
                  x.id,
                  date(x.service_date) + " · " + x.service_key,
                ]),
            )}
            {notes(true, "Reason for correction")}
            <p className="vj-hint vj-wide">
              The original evidence is retained and marked void. Record
              replacement evidence separately.
            </p>
          </>
        );
      case "intention":
        return (
          <>
            {select(
              "intention",
              "Preparation / joining decision",
              [
                ["unknown", "Not discussed"],
                ["interested", "Interested in joining"],
                ["invited", "Contacted / invited"],
                ["confirmed", "Confirmed intention to join"],
                ["undecided", "Undecided"],
                ["deferred", "Deferred"],
                ["did_not_join", "Did not join this time"],
              ],
              person?.intention,
            )}
            {notes(false)}
            <p className="vj-hint vj-wide">
              Deferral preserves their eligibility and attendance history.
            </p>
          </>
        );
      case "join":
      case "legacy_date":
        return (
          <>
            {field(
              "date",
              "Actual official membership date",
              "date",
              true,
              today(),
            )}
            {notes(
              true,
              modal === "legacy_date"
                ? "Documentary evidence / administrator reconciliation reason"
                : "Joining confirmation and evidence",
            )}
            <p className="vj-hint vj-wide">
              {modal === "join"
                ? "This explicitly confirms official membership after one recorded previous VBC church visit."
                : "For a pre-existing official member only: confirm the actual date from reliable records; never guess it."}{" "}
              The same person ID, guest history and friend are retained. Six
              calendar months of care start on this date. No login account is
              created.
            </p>
          </>
        );
      case "care_review":
        return (
          <>
            {select(
              "decision",
              "Review decision",
              [
                ["extend", "Extend continuing care"],
                [
                  "complete",
                  "Complete after minimum period and approved review",
                ],
              ],
              "extend",
            )}
            {field(
              "date",
              "New review date (required for extension)",
              "date",
              false,
            )}
            {notes(true, "Care assessment and sign-off evidence")}
            <p className="vj-hint vj-wide">
              Care cannot close before {date(person?.care_until)}.{" "}
              {p.care_policy ||
                "Final sign-off criteria await church approval; completion stays blocked."}
            </p>
          </>
        );
      case "cohort":
        return (
          <>
            {field("name", "Cohort name")}
            {field("date", "Cohort start date", "date")}
          </>
        );
      case "enrol":
        return (
          <>
            {field(
              "date",
              "Actual enrolment date · leave unknown dates blank",
              "date",
              false,
              today(),
            )}
            {select(
              "cohort",
              "CFC cohort",
              snapshot.cohorts.map((c) => [
                c.id,
                c.name + " · " + date(c.starts_on),
              ]),
            )}
            <p className="vj-hint vj-wide">
              Seven weeks of classes run alongside continuing care. CFC
              completion does not close the friend’s assignment.
            </p>
          </>
        );
      case "class_attendance":
        return (
          <>
            {select(
              "attendanceStatus",
              "Class attendance outcome",
              [
                ["present", "Attended"],
                ["absent", "Missed / absent"],
              ],
              "present",
            )}
            {select(
              "week",
              "Class week",
              Array.from({ length: 7 }, (_, i) => [
                String(i + 1),
                "Week " + (i + 1),
              ]),
            )}
            {field("date", "Actual class date", "date", true, today())}
            {notes(false, "Additional attendance evidence / correction reason")}
            <label className="vj-wide vj-check">
              <input type="checkbox" name="correction" />
              This corrects an existing week. A reason is required.
            </label>
          </>
        );
      case "complete_cfc":
        return (
          <>
            {field("date", "Actual completion date", "date", true, today())}
            {notes(
              true,
              "Assessment against approved completion / make-up policy",
            )}
            <p className="vj-hint vj-wide">
              {p.cfc_policy || "Completion policy is not yet approved."}{" "}
              Completion is a Coordinator assessment, never automatic from seven
              ticks.
            </p>
          </>
        );
      case "certificate":
        return (
          <>
            {field(
              "date",
              "Actual certificate award date · leave unknown dates blank",
              "date",
              false,
              today(),
            )}
            {field("number", "Approved certificate number")}
            {notes(true, "Certificate award evidence")}
            <p className="vj-hint vj-wide">
              Use the church’s approved numbering process. This records the
              award; it does not generate a certificate document.
            </p>
          </>
        );
      case "role":
        return (
          <>
            {select(
              "worker",
              "Existing staff account",
              snapshot.team.map((t) => [t.id, t.name + " · " + pretty(t.role)]),
            )}
            {select("capability", "Journey capability", [
              ["coordinator", "Follow Through Coordinator"],
              ["foundation", "Foundation Class Coordinator"],
              ["friend", "Follow Through Friend"],
            ])}
            {select(
              "enabled",
              "Change",
              [
                ["true", "Grant capability"],
                ["false", "Remove capability"],
              ],
              "true",
            )}
            {notes(true, "Approval / reason")}
            <p className="vj-hint vj-wide">
              This grants module access to an existing staff login. It does not
              create accounts or change global Member Care permissions.
            </p>
            <section className="vj-wide vj-team-review">
              <h3>Current journey access</h3>
              {snapshot.team.map((t) => (
                <div key={t.id}>
                  <strong>{t.name}</strong>
                  <small>
                    {t.role === "administrator"
                      ? "Administrator · all journey permissions"
                      : [
                          ...new Set([
                            ...t.capabilities,
                            ...(t.role === "followup_worker" ? ["friend"] : []),
                          ]),
                        ]
                          .map(pretty)
                          .join(" · ") || "No journey capability assigned"}
                  </small>
                </div>
              ))}
            </section>
          </>
        );
      case "policy":
        return (
          <>
            <label className="vj-wide">
              Optional church service labels · one per line
              <textarea
                name="serviceTypes"
                rows={3}
                maxLength={2000}
                defaultValue={p.service_types.join("\n")}
              />
            </label>
            {field(
              "firstContactHours",
              "Preferred first-contact window (hours)",
              "number",
              true,
              String(p.first_contact_hours),
            )}
            <label className="vj-wide">
              Approved CFC assessment, make-up and certificate rules
              <textarea
                name="cfcPolicy"
                maxLength={4000}
                rows={3}
                defaultValue={p.cfc_policy || ""}
              />
            </label>
            <label className="vj-wide">
              Approved continuing-care sign-off criteria
              <textarea
                name="carePolicy"
                maxLength={4000}
                rows={3}
                defaultValue={p.care_policy || ""}
              />
            </label>
            {notes(true, "Church approval reference / reason")}
            <p className="vj-hint vj-wide">
              Leave unconfirmed CFC and care policies blank. Optional service
              labels do not add membership screening or change original
              attendance evidence.
            </p>
          </>
        );
      default:
        return null;
    }
  }
  const button = (
    name: string,
    label?: string,
    secondary = true,
    disabled = false,
  ) => (
    <button
      className={secondary ? "vj-secondary" : "vj-primary"}
      onClick={() => action(name)}
      disabled={disabled || busy || loading}
    >
      {label || actionNames[name]}
      <Icon name="arrow" />
    </button>
  );
  function historyList(entries: Entry[], kind: string) {
    return entries.length ? (
      <div className="vj-history">
        {entries.map((e) => (
          <article key={e.id}>
            <span className="vj-dot" />
            <div>
              <strong>
                {kind === "attendance"
                  ? e.service_key
                  : kind === "events"
                    ? pretty(e.action || "")
                    : pretty(e.outcome || e.kind || "Activity")}
              </strong>
              <p>
                {e.note ||
                  e.evidence ||
                  String(e.detail?.note || "Recorded change")}
              </p>
              <small>
                {date(
                  e.occurred_at || e.service_date || e.created_at || e.due_at,
                  true,
                )}
                {e.method ? " · " + pretty(e.method) : ""}
                {e.actor_name ? " · Recorded by " + e.actor_name : ""}
              </small>
              {kind === "attendance" && (
                <div className="vj-badges">
                  <Badge
                    tone={e.voided_at ? "red" : e.qualifies ? "green" : "amber"}
                  >
                    {e.voided_at
                      ? "Voided"
                      : e.qualifies
                        ? "Qualifying"
                        : "Not qualifying"}
                  </Badge>
                  <Badge tone="neutral">{pretty(e.verification || "")}</Badge>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    ) : (
      <Empty>
        No {kind === "events" ? "journey changes" : kind} recorded yet.
      </Empty>
    );
  }
  function profile() {
    if (!person || !detail)
      return <Empty>Loading this person’s journey…</Empty>;
    const joined = !!person.official_joined_on;
    return (
      <>
        <button className="vj-back" onClick={closeProfile}>
          ← Back to {labels[view].toLowerCase()}
        </button>
        <section className="vj-profile-head">
          <div className="vj-avatar large">
            {person.name
              ?.split(" ")
              .map((x) => x[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div>
            <div className="vj-eyebrow">ONE PERSON · ONE CONNECTED JOURNEY</div>
            <h1>{person.name}</h1>
            <div className="vj-badges">
              <Badge tone={person.status === "member" ? "green" : "blue"}>
                {person.status === "member"
                  ? "Official member"
                  : (person.membership_eligible ?? person.service_count >= 1)
                    ? "Membership eligible"
                    : "Visitor"}
              </Badge>
              {person.membership_review && (
                <Badge tone="amber">Membership evidence needs review</Badge>
              )}
              <Badge tone="neutral">
                {person.registration_source === "direct"
                  ? "Direct registration"
                  : person.registration_source === "visitor_form"
                    ? "Guest intake"
                    : person.registration_source === "staff_visitor"
                      ? "Staff visitor record"
                      : "Historical source unknown"}
              </Badge>
              {person.followup_state && person.followup_state !== "active" && (
                <Badge tone="amber">{pretty(person.followup_state)}</Badge>
              )}
              {!person.contact_consent && (
                <Badge tone="red">Outreach paused</Badge>
              )}
            </div>
            <p>
              Follow Through Friend:{" "}
              <strong>{person.worker_name || "Not assigned"}</strong>
            </p>
          </div>
          <div className="vj-profile-actions">
            {person.phone &&
              person.contact_consent &&
              person.followup_state === "active" && (
                <a className="vj-secondary" href={"tel:" + person.phone}>
                  <Icon name="phone" />
                  Call
                </a>
              )}
            {own && button("contact", "Log outcome", false)}
            {own && button("purpose", "Visit purpose")}
            {own && button("followup_state", "Contact status")}
            {caps?.coordinator &&
              button(
                "assign",
                person.assigned_to ? "Reassign friend" : "Assign friend",
              )}
          </div>
        </section>
        {(own ||
          (person.phone &&
            person.contact_consent &&
            person.followup_state === "active")) && (
          <div className="vj-quickbar" aria-label="Quick actions">
            {person.phone &&
              person.contact_consent &&
              person.followup_state === "active" && (
                <a className="vj-secondary" href={"tel:" + person.phone}>
                  <Icon name="phone" />
                  Call
                </a>
              )}
            {own &&
              person.contact_consent &&
              person.followup_state === "active" && (
                <button
                  className="vj-secondary"
                  onClick={() => setTab("whatsapp")}
                >
                  <Icon name="whatsapp" />
                  WhatsApp
                </button>
              )}
            {own && (
              <button
                className="vj-primary"
                onClick={() => action("contact")}
                disabled={busy || loading}
              >
                Log outcome
              </button>
            )}
          </div>
        )}
        <details className="vj-panel vj-contact-details">
          <summary>
            Contact details & first visit <span>View recorded details</span>
          </summary>
          <div className="vj-facts">
            <div>
              <small>Phone</small>
              <strong>
                {person.phone || "Unavailable / permission restricted"}
              </strong>
            </div>
            <div>
              <small>Email</small>
              <strong>{person.email || "Unavailable / opted out"}</strong>
            </div>
            <div>
              <small>First visit on record</small>
              <strong>
                {date(person.reported_first_visit || person.first_visit_on)}
              </strong>
              <small>Registration is not attendance evidence</small>
            </div>
            <div>
              <small>Visit purpose</small>
              <strong>
                {visitPurposes[person.visit_purpose] || "Not specified"}
              </strong>
              <small>Official membership</small>
              <strong>{date(person.official_joined_on)}</strong>
            </div>
          </div>
        </details>
        <div className="vj-tabs" aria-label="Profile sections">
          {[
            ["journey", "Journey"],
            ["contact", "Contact log"],
            ["membership", "Membership & CFC"],
            ["community", "Community"],
            ...(own ? [["whatsapp", "WhatsApp"]] : []),
          ].map(([t, label]) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "contact" && own && person && (
          <JourneyCelebrationDates
            key={person.member_id}
            member={person.member_id}
          />
        )}
        {tab === "whatsapp" && own && (
          <WhatsAppInvitations
            key={person.member_id}
            memberId={person.member_id}
            name={person.name}
            onSaved={() => void load()}
          />
        )}
        {tab === "journey" && (
          <>
            <div className="vj-grid">
              <section className="vj-panel">
                <div className="vj-panel-head">
                  <div>
                    <span className="vj-eyebrow">EVERY STEP COUNTS</span>
                    <h2>The journey so far</h2>
                  </div>
                  <Icon name="care" />
                </div>
                <ol className="vj-milestones">
                  <li>
                    <span>1</span>
                    <div>
                      <strong>Registration & identity check</strong>
                      <p>
                        {detail.guests.length
                          ? detail.guests.length +
                            " original submission(s) linked and retained."
                          : "Central record retained; no guest submission linked."}
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>
                        First VBC visit ·{" "}
                        {person.previous_visit_confirmed || person.service_count
                          ? "Recorded"
                          : "Not recorded"}
                      </strong>
                      <p>
                        One previous VBC church visit is enough. The source and
                        verification level stay visible.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>
                        {joined
                          ? "Officially joined · " +
                            date(person.official_joined_on)
                          : "Explicit joining confirmation"}
                      </strong>
                      <p>
                        {joined
                          ? "Confirmed by the Coordinator; original guest history preserved."
                          : person.legacy_member
                            ? "Legacy member: actual joining date requires reconciliation."
                            : "Eligibility prepares the person for joining; it does not make them a member."}
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>4</span>
                    <div>
                      <strong>Foundation classes + continuing care</strong>
                      <p>
                        Seven-week CFC and a minimum of six calendar months with
                        their friend.
                      </p>
                    </div>
                  </li>
                </ol>
              </section>
              <div className="vj-stack">
                {tracks()}
                {person.assignment_conflict && (
                  <div className="vj-notice">
                    Multiple legacy assignments need Coordinator review. Choose
                    one friend explicitly.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        {tab === "contact" && (
          <section className="vj-panel">
            <div className="vj-panel-head">
              <div>
                <h2>Contact journal</h2>
                <p>Attempts and successful conversations remain distinct.</p>
              </div>
              {own && button("contact", "Log outcome", false)}
            </div>
            <div className="vj-inset">
              <div className="vj-badges">
                <Badge>{detail.contacts.length} attempts logged</Badge>
                <Badge tone="green">
                  {
                    detail.contacts.filter(
                      (x) =>
                        !["no_answer", "unreachable"].includes(x.outcome || ""),
                    ).length
                  }{" "}
                  successful contacts
                </Badge>
              </div>
              <h3 style={{ marginTop: 20 }}>Next actions</h3>
              {detail.tasks.length ? (
                detail.tasks.map((t) => (
                  <p key={t.id} className="vj-hint">
                    {pretty(t.kind || "Follow Through")} ·{" "}
                    {date(t.due_at, true)}
                    <br />
                    {t.note}
                  </p>
                ))
              ) : (
                <p className="vj-hint">
                  No open tasks. Record a preferred next contact date when
                  appropriate.
                </p>
              )}
              <p className="vj-hint">
                First-contact target: {snapshot?.policy.first_contact_hours}{" "}
                hours from registration; seven days is overdue.{" "}
                {person.official_joined_on
                  ? "After joining, contact frequency follows individual preferences and Coordinator direction; the church-wide cadence is still awaiting confirmation."
                  : "Visitor contact is provisionally once or twice a week, respecting individual preferences."}
              </p>
            </div>
            {historyList(detail.contacts, "contacts")}
            {detail.legacy_contacts.length > 0 && (
              <>
                <h3 className="vj-inset">Earlier Follow Through history</h3>
                {historyList(detail.legacy_contacts, "legacy contacts")}
              </>
            )}
          </section>
        )}
        {tab === "membership" && (
          <section className="vj-panel">
            <div className="vj-panel-head">
              <div>
                <h2>Church attendance evidence</h2>
                <p>
                  {person.service_count} church visit(s) recorded. Home Cell and
                  CFC are separate.
                </p>
              </div>
              <div className="vj-actions">
                {own && button("attendance", "Add attendance", false)}
                {own &&
                  button(
                    "previous_visit",
                    "Previous visit · exact date unknown",
                  )}
                {caps?.coordinator &&
                  (detail.previous_visits || []).some((x) => !x.voided_at) &&
                  button("void_previous_visit", "Correct confirmation")}
                {caps?.coordinator &&
                  (!joined || caps?.administrator) &&
                  button("void_attendance", "Correct entry")}
              </div>
            </div>
            {(detail.previous_visits || []).map((x) => (
              <div className="vj-inset" key={x.id}>
                <Badge tone={x.voided_at ? "red" : "green"}>
                  {x.voided_at
                    ? "Voided confirmation"
                    : "Previous visit confirmed · exact date unknown"}
                </Badge>
                <p>
                  Known to have visited before {date(x.known_before)}.{" "}
                  {x.evidence}
                </p>
                <small>
                  Source: {pretty(x.source)} · Recorded{" "}
                  {date(x.recorded_at, true)}
                </small>
              </div>
            ))}
            {historyList(detail.attendance, "attendance")}
          </section>
        )}
        {tab === "membership" && (
          <section className="vj-panel">
            <div className="vj-panel-head">
              <div>
                <h2>
                  {joined
                    ? "Official membership confirmed"
                    : "Prepare for Membership Sunday"}
                </h2>
                <p>
                  Next planned Sunday: {date(nextMembershipSunday())}. Actual
                  joining may be recorded on another date with evidence.
                </p>
              </div>
            </div>
            <div className="vj-inset">
              <p>
                {joined
                  ? "Officially joined on " + date(person.official_joined_on)
                  : "Current intention: " +
                    pretty(person.intention) +
                    ". Eligibility: " +
                    person.service_count +
                    " recorded church visit(s). One previous visit is enough."}
              </p>
              <div className="vj-actions">
                {caps?.coordinator &&
                  !joined &&
                  button("intention", "Update preparation")}
                {caps?.coordinator &&
                  !joined &&
                  !person.legacy_member &&
                  button(
                    "join",
                    "Confirm joined",
                    false,
                    !person.previous_visit_confirmed &&
                      (!person.first_visit_on ||
                        person.first_visit_on >= today()),
                  )}
                {caps?.administrator &&
                  person.membership_review &&
                  button("review_membership", "Review corrected evidence")}
                {caps?.administrator &&
                  person.legacy_member &&
                  !joined &&
                  button("legacy_date", "Confirm historical date", false)}
              </div>
              <p className="vj-hint">
                The original guest submission and visit date are retained. No
                duplicate person or login is created.
              </p>
            </div>
          </section>
        )}
        {(tab === "membership" || tab === "community") && (
          <div className="vj-track-grid">
            {tracks(tab === "membership" ? "cfc" : "followthrough")}
          </div>
        )}
        {tab === "community" && (
          <IntegrationProfile
            detail={detail}
            snapshot={snapshot!}
            own={!!own}
            action={action}
          />
        )}
        {tab === "community" && (
          <IntegrationProfile
            detail={detail}
            snapshot={snapshot!}
            own={!!own}
            action={action}
            section="care"
          />
        )}
        {tab === "contact" && (
          <div className="vj-grid">
            <section className="vj-panel">
              <div className="vj-panel-head">
                <h2>Journey audit trail</h2>
              </div>
              {historyList(detail.events, "events")}
            </section>
            <section className="vj-panel">
              <div className="vj-panel-head">
                <h2>Original guest records</h2>
              </div>
              {detail.guests.length ? (
                <div className="vj-inset">
                  {detail.guests.map((g) => (
                    <article key={g.id} className="vj-source">
                      <strong>{date(g.visit_date)}</strong>
                      <p>
                        {g.source === "wordpress"
                          ? "MAIN CHURCH WEBSITE"
                          : pretty(g.source)}{" "}
                        · {g.review_status}
                      </p>
                      <small>Retained submission · {g.id}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty>
                  No original guest submission linked to this person.
                </Empty>
              )}
            </section>
          </div>
        )}
      </>
    );
  }
  function tracks(only?: string) {
    if (!person || !detail || !snapshot) return null;
    const cfc = detail.cfc;
    return (
      <>
        {(!only || only === "journey" || only === "cfc") && (
          <section className="vj-panel vj-track">
            <span className="vj-track-icon purple">
              <Icon name="cfc" />
            </span>
            <span className="vj-eyebrow">FOUNDATION · 7 WEEKS</span>
            <h2>Rooted in faith</h2>
            <p>
              {cfc
                ? snapshot.cohorts.find((c) => c.id === cfc.cohort_id)?.name
                : "CFC enrolment follows confirmed official membership."}
            </p>
            <div className="vj-week-grid">
              {Array.from({ length: 7 }, (_, i) => (
                <span
                  key={i}
                  className={
                    detail.cfc_attendance.some(
                      (a) =>
                        a.week === i + 1 && a.attendance_status !== "absent",
                    )
                      ? "done"
                      : detail.cfc_attendance.some(
                            (a) =>
                              a.week === i + 1 &&
                              a.attendance_status === "absent",
                          )
                        ? "missed"
                        : ""
                  }
                  title={
                    detail.cfc_attendance.some(
                      (a) =>
                        a.week === i + 1 && a.attendance_status !== "absent",
                    )
                      ? "Attendance recorded"
                      : detail.cfc_attendance.some(
                            (a) =>
                              a.week === i + 1 &&
                              a.attendance_status === "absent",
                          )
                        ? "Missed / absent"
                        : "Not recorded"
                  }
                >
                  {i + 1}
                </span>
              ))}
            </div>
            <p className="vj-hint">
              {
                detail.cfc_attendance.filter(
                  (a) => a.attendance_status !== "absent",
                ).length
              }{" "}
              / 7 weeks attended.{" "}
              {
                detail.cfc_attendance.filter(
                  (a) => a.attendance_status === "absent",
                ).length
              }{" "}
              recorded missed classes.{" "}
              {cfc?.completed_on
                ? "Completed " + date(cfc.completed_on)
                : "No automatic completion."}
            </p>
            {detail.cfc_attendance.length > 0 && (
              <div className="vj-class-dates">
                {detail.cfc_attendance.map((e) => (
                  <span key={e.week}>
                    Week {e.week} · {date(e.attended_on)} ·{" "}
                    {e.attendance_status === "absent" ? "Missed" : "Attended"}
                  </span>
                ))}
              </div>
            )}
            {cfc?.certificate_number && (
              <Badge tone="green">Certificate: {cfc.certificate_number}</Badge>
            )}
            <div className="vj-actions">
              {caps?.foundation &&
                person.official_joined_on &&
                !cfc &&
                button(
                  "enrol",
                  "Enrol in cohort",
                  false,
                  !snapshot.cohorts.length,
                )}
              {caps?.foundation &&
                cfc &&
                !cfc.completed_on &&
                button("class_attendance", "Record week", false)}
              {caps?.foundation &&
                cfc &&
                !cfc.completed_on &&
                button(
                  "complete_cfc",
                  "Assess completion",
                  true,
                  !snapshot.policy.cfc_policy,
                )}
              {caps?.foundation &&
                cfc?.completed_on &&
                !cfc.certificate_number &&
                button(
                  "certificate",
                  "Record award",
                  true,
                  !snapshot.policy.cfc_policy,
                )}
            </div>
            {!snapshot.policy.cfc_policy && (
              <p className="vj-hint">
                Completion, make-up and certificate rules await church approval.
              </p>
            )}
          </section>
        )}
        {(!only || only === "journey" || only === "followthrough") && (
          <section className="vj-panel vj-track">
            <span className="vj-track-icon blue">
              <Icon name="care" />
            </span>
            <span className="vj-eyebrow">
              CONTINUING CARE · AT LEAST 6 MONTHS
            </span>
            <h2>Connected for the journey</h2>
            <p>
              {person.worker_name || "A Follow Through Friend is still needed."}
            </p>
            <div className="vj-care-dates">
              <div>
                <small>Official joining</small>
                <strong>{date(person.official_joined_on)}</strong>
              </div>
              <Icon name="arrow" />
              <div>
                <small>Care review due</small>
                <strong>{date(person.care_until)}</strong>
              </div>
            </div>
            <p className="vj-hint">
              {person.care_status === "completed"
                ? "Coordinator reviewed and completed care."
                : "Care continues during and after CFC. It stays open until the Coordinator reviews it."}
            </p>
            <div className="vj-actions">
              {caps?.coordinator &&
                person.official_joined_on &&
                button("care_review", "Review / extend care")}
              {caps?.coordinator && button("assign", "Reassign friend")}
            </div>
          </section>
        )}
      </>
    );
  }
  const friendOnly = !!caps?.friend && !caps.coordinator && !caps.foundation;
  if (friendOnly && friendMode)
    return (
      <FriendDesk
        staff={staff}
        dark={dark}
        onTheme={theme}
        onFullView={() => chooseFriendMode(false)}
        onSignOut={() => void signout()}
      />
    );
  return (
    <div className="vj-app">
      <aside className={"vj-sidebar " + (menu ? "is-open" : "")}>
        <a
          className="vj-brand"
          href={staff.role === "followup_worker" ? "/followups" : "/overview"}
        >
          <img
            src="/assets/image-7d4e31b34082.png"
            alt="Vine Branch Church crest"
          />
          <span>
            VINE BRANCH<strong>MEMBER CARE</strong>
            <small>People. Purpose. Belonging.</small>
          </span>
        </a>
        <span className="vj-nav-label">FOLLOW THROUGH</span>
        <nav aria-label="Visitor journey">
          {Object.entries(labels)
            .filter(([key]) =>
              key === "friends"
                ? !!caps?.coordinator
                : !caps ||
                  caps.coordinator ||
                  caps.friend ||
                  ["overview", "cfc", "care"].includes(key),
            )
            .map(([key, label]) => (
              <button
                key={key}
                className={view === key ? "active" : ""}
                aria-current={view === key ? "page" : undefined}
                onClick={() => navigate(key)}
              >
                <Icon name={key === "friends" ? "visitors" : key} />
                {label}
                {key === "membership" && !!stats.eligible && (
                  <b>{stats.eligible}</b>
                )}
              </button>
            ))}
        </nav>
        <div className="vj-nav-extra">
          {caps?.administrator && (
            <>
              <button
                onClick={() => {
                  closeProfile();
                  action("role");
                }}
              >
                <Icon name="visitors" />
                Team & access
              </button>
              <button
                onClick={() => {
                  closeProfile();
                  action("policy");
                }}
              >
                <Icon name="settings" />
                Journey policy
              </button>
            </>
          )}
          {staff.role !== "followup_worker" && (
            <a href="/guests">
              <Icon name="visitors" />
              Guest submissions
            </a>
          )}
          {staff.role !== "followup_worker" && (
            <a href="/overview">← Member Care dashboard</a>
          )}
          {staff.role !== "followup_worker" && (
            <a href="/home-cell">Home Cell Office ↗</a>
          )}
        </div>
        <div className="vj-sidebar-bottom">
          <p>
            Every person matters.
            <br />
            <strong>Every step is worth caring for.</strong>
          </p>
          <button onClick={signout}>Sign out</button>
        </div>
      </aside>
      {menu && (
        <button
          className="vj-menu-shade"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="vj-main">
        <header className="vj-topbar">
          <button
            className="vj-menu-button vj-icon"
            aria-label="Open navigation"
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
          <div className="vj-breadcrumb">
            Member Care <span>/</span>{" "}
            {selected ? "Person’s journey" : labels[view]}
          </div>
          <div className="vj-top-controls">
            {friendOnly && (
              <button
                className="vj-secondary"
                onClick={() => chooseFriendMode(true)}
              >
                Friend mode
              </button>
            )}
            <button
              className="vj-find"
              onClick={() => setPalette(true)}
              aria-keyshortcuts="/ Control+K Meta+K"
            >
              <Icon name="search" />
              <span>Find a person</span>
              <kbd aria-hidden="true">/</kbd>
            </button>
            <button
              className="vj-theme"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={dark}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={theme}
            >
              <Icon name={dark ? "sun" : "moon"} />
              <span>{dark ? "Light" : "Dark"}</span>
            </button>
            <span className="vj-top-avatar">
              {staff.display_name.slice(0, 1)}
            </span>
            <div className="vj-user">
              <strong>{staff.display_name}</strong>
              <small>
                {caps?.coordinator
                  ? "Follow Through Coordinator"
                  : caps?.foundation
                    ? "Foundation Class Coordinator"
                    : "Follow Through Friend"}
              </small>
            </div>
          </div>
        </header>
        <main className="vj-content" aria-busy={loading}>
          {!snapshot ? (
            <section className="vj-panel vj-loading">
              <h1>
                {loading
                  ? "Preparing your care workspace…"
                  : "Your care workspace"}
              </h1>
              <p>
                {loading
                  ? "Loading the people and tasks you have access to."
                  : error || "Journey access is required."}
              </p>
              {!loading && (
                <button className="vj-primary" onClick={() => void load()}>
                  Try again
                </button>
              )}
            </section>
          ) : selected ? (
            profile()
          ) : (
            <>
              <div className="vj-page-title">
                <div>
                  <span className="vj-eyebrow">
                    {view === "overview"
                      ? new Date().toLocaleDateString("en-GB", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          timeZone: "Africa/Lagos",
                        })
                      : "VINE BRANCH CHURCH"}
                  </span>
                  <h1>{view === "overview" ? "Today’s care" : labels[view]}</h1>
                  <p>
                    {view === "overview"
                      ? overdueCount
                        ? `${overdueCount} ${overdueCount === 1 ? "person is" : "people are"} overdue for contact. Start there.`
                        : "Nobody is overdue. Here’s who to contact next."
                      : view === "friends"
                        ? "Create Friend accounts and manage four-digit PINs."
                        : view === "membership"
                          ? "Prepare, confirm and welcome people into membership."
                          : view === "register"
                            ? "Your working register: people, contact details, membership and assigned Friend."
                            : view === "cfc"
                              ? "Choose a person to enrol or record weekly class attendance."
                              : view === "reports"
                                ? "Review results for a period and see each Friend’s assigned people."
                                : "Keep every person connected to the care they need."}
                  </p>
                </div>
                {(caps?.coordinator || caps?.friend) &&
                  ["overview", "register", "visitors", "membership"].includes(
                    view,
                  ) && (
                    <div className="vj-actions">
                      {caps?.coordinator && (
                        <a className="vj-secondary" href="/historical-guests">
                          Historical guests
                        </a>
                      )}
                      {button("direct", "Register a person", false)}
                      <button
                        className="vj-secondary"
                        onClick={() => setImporting(true)}
                      >
                        Import CSV
                      </button>
                    </div>
                  )}
                {view === "cfc" &&
                  caps?.foundation &&
                  button("cohort", "Create cohort", false)}
              </div>
              {view === "friends" && caps?.coordinator ? (
                <FriendAccounts />
              ) : view === "reports" ? (
                <JourneyReports snapshot={snapshot} onPerson={openPerson} />
              ) : (
                <>
                  {view === "overview" && (
                    <div className="vj-metrics vj-metrics-today">
                      {[
                        [
                          "overdue",
                          "Overdue",
                          "Past their Follow Through time",
                          "queue",
                        ],
                        [
                          "visitors",
                          "Visitors receiving care",
                          "Open visitor records",
                          "visitors",
                        ],
                        [
                          "unassigned",
                          "Awaiting a friend",
                          "Need a Follow Through Friend",
                          "visitors",
                        ],
                        [
                          "eligible",
                          "Ready to join",
                          "For " + date(nextMembershipSunday()),
                          "membership",
                        ],
                        [
                          "care",
                          "Continuing care",
                          "New members in care",
                          "care",
                        ],
                      ].map(([key, label, caption, target]) => (
                        <button
                          key={key}
                          className={
                            "vj-metric" +
                            (key === "overdue" && overdueCount
                              ? " is-alert"
                              : "")
                          }
                          onClick={() =>
                            navigate(
                              target === "queue" ? "overview" : target,
                              key === "overdue"
                                ? "overdue"
                                : key === "unassigned"
                                  ? "unassigned"
                                  : key === "eligible"
                                    ? "eligible"
                                    : "all",
                            )
                          }
                        >
                          <span>{label}</span>
                          <strong>{stats[key] || 0}</strong>
                          <small>{caption}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  {view === "membership" && (
                    <div className="vj-notice">
                      A simple list of previous visitors who may want to join.
                      One previous VBC visit is enough; the Coordinator confirms
                      actual joining.
                    </div>
                  )}
                  {view === "overview" && (
                    <div className="vj-queue-filter">
                      <label>
                        Today’s queue
                        <select
                          aria-label="Today queue"
                          value={stage}
                          onChange={(e) => {
                            setStage(e.target.value);
                            setPage(0);
                          }}
                        >
                          <option value="all">All next actions</option>
                          <option value="overdue">Overdue only</option>
                        </select>
                      </label>
                    </div>
                  )}
                  {view === "visitors" && (
                    <div className="vj-queue-filter">
                      <label>
                        Visitor Follow Through status
                        <select
                          value={
                            [
                              "paused",
                              "inactive",
                              "declined_contact",
                              "unassigned",
                            ].includes(stage)
                              ? stage
                              : "all"
                          }
                          onChange={(e) => {
                            setStage(e.target.value);
                            setPage(0);
                          }}
                        >
                          <option value="all">
                            Visitors in Follow Through
                          </option>
                          <option value="unassigned">Awaiting a friend</option>
                          <option value="paused">Paused</option>
                          <option value="inactive">Inactive</option>
                          <option value="declined_contact">
                            Declined contact
                          </option>
                        </select>
                      </label>
                    </div>
                  )}
                  {view === "cfc" && (
                    <div className="vj-notice">
                      Seven weeks of classes run alongside care.{" "}
                      {snapshot.cohorts.length} cohort(s) available.{" "}
                      {!snapshot.policy.cfc_policy &&
                        "Completion and certificate rules await church approval."}
                    </div>
                  )}
                  <section className="vj-panel" id="vj-queue">
                    <div className="vj-panel-head">
                      <div>
                        <h2>
                          {view === "overview"
                            ? "Who to contact next"
                            : labels[view]}
                        </h2>
                        <p>
                          {view === "overview"
                            ? `${overdueCount} overdue · ${unassignedCount} ${unassignedCount === 1 ? "visitor awaits" : "visitors await"} a friend`
                            : view === "membership"
                              ? "Eligibility is not official membership. The Coordinator must confirm actual joining."
                              : "Select a person to see their complete journey and available actions."}
                        </p>
                      </div>
                      <button
                        className="vj-icon"
                        aria-label="Refresh journey"
                        disabled={loading}
                        onClick={() => void load()}
                      >
                        ↻
                      </button>
                    </div>
                    {view === "membership" && (
                      <div className="vj-queue-filter">
                        <label>
                          Preparation queue
                          <select
                            aria-label="Membership queue"
                            value={stage}
                            onChange={(e) => {
                              setStage(e.target.value);
                              setPage(0);
                            }}
                          >
                            {[
                              ["all", "Preparation list"],
                              ["eligible", "Membership eligible"],
                              ["interested", "Interested"],
                              ["invited", "Contacted / invited"],
                              ["confirmed", "Confirmed intention"],
                              ["awaiting", "Awaiting response"],
                              ["deferred", "Deferred"],
                              ["did_not_join", "Did not join"],
                              ["joined", "Officially joined"],
                            ].map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                    <form
                      className="vj-search"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setSearch(query.trim());
                        setPage(0);
                      }}
                    >
                      <Icon name="search" />
                      <input
                        aria-label="Search people by name"
                        placeholder="Find someone by name…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        maxLength={120}
                      />
                      <button className="vj-secondary" type="submit">
                        Search
                      </button>
                    </form>
                    {["register", "cfc"].includes(view) ? (
                      <JourneyRegister
                        people={rows}
                        classes={view === "cfc"}
                        onPerson={openPerson}
                      />
                    ) : (
                      <>
                        <div className="vj-table-head">
                          <span>PERSON</span>
                          <span>JOURNEY STAGE</span>
                          <span>Follow Through FRIEND</span>
                          <span>NEXT STEP</span>
                        </div>
                        {rows.length ? (
                          rows.map((p) => (
                            <div key={p.member_id} className="vj-queue-row">
                              <button
                                className="vj-person-row"
                                onClick={() => openPerson(p.member_id)}
                              >
                                <span className="vj-person">
                                  <span className="vj-avatar">
                                    {p.name
                                      .split(" ")
                                      .map((x) => x[0])
                                      .slice(0, 2)
                                      .join("")}
                                  </span>
                                  <span>
                                    <strong>{p.name}</strong>
                                    <small>
                                      {p.reported_first_visit
                                        ? "First visit reported " +
                                          date(p.reported_first_visit)
                                        : "Visit date not verified"}
                                    </small>
                                  </span>
                                </span>
                                <span>
                                  <Badge
                                    tone={
                                      p.status === "member"
                                        ? "green"
                                        : (p.membership_eligible ??
                                            p.service_count >= 1)
                                          ? "purple"
                                          : "blue"
                                    }
                                  >
                                    {p.status === "member"
                                      ? "Official member"
                                      : (p.membership_eligible ??
                                          p.service_count >= 1)
                                        ? "Membership eligible"
                                        : "Previous visit not recorded"}
                                  </Badge>
                                  {view === "membership" && (
                                    <small>{pretty(p.intention)}</small>
                                  )}
                                  {p.legacy_member && !p.official_joined_on && (
                                    <small>
                                      Joining date needs confirmation
                                    </small>
                                  )}
                                </span>
                                <span className="vj-worker">
                                  {view === "ministry"
                                    ? `${p.ministry_count || 0} active team(s)`
                                    : view === "home_cells"
                                      ? p.home_cell_name || "Not recorded"
                                      : p.worker_name || "Not assigned"}
                                  {p.assignment_conflict && (
                                    <small>Resolve assignment conflict</small>
                                  )}
                                </span>
                                <span className="vj-row-next">
                                  <span>
                                    {p.next_due
                                      ? date(p.next_due, true)
                                      : p.status === "member"
                                        ? "View continuing care"
                                        : !p.assigned_to
                                          ? "Assign a friend"
                                          : "View journey"}
                                    {p.next_due &&
                                      Date.parse(p.next_due) < Date.now() && (
                                        <small className="vj-overdue">
                                          {p.contact_count > 0 ||
                                          Date.parse(p.registered_at) <
                                            Date.now() - 7 * 86400000
                                            ? "Overdue"
                                            : "Needs attention"}
                                        </small>
                                      )}
                                  </span>
                                  <Icon name="arrow" />
                                </span>
                              </button>
                              {rowActions(p)}
                            </div>
                          ))
                        ) : (
                          <Empty>
                            {search
                              ? "No people match this search."
                              : view === "membership"
                                ? "No people in this preparation view yet. One previous VBC visit is enough to be eligible."
                                : "No people in this queue yet. Reviewed guest submissions and existing central records appear here when your role permits."}
                          </Empty>
                        )}
                      </>
                    )}
                    <div className="vj-pagination">
                      <span>
                        {snapshot.total === 0
                          ? "0 people"
                          : `${page * 30 + 1}–${Math.min((page + 1) * 30, snapshot.total)} of ${snapshot.total} people`}
                        {loading ? " · Refreshing…" : ""}
                      </span>
                      <div>
                        <button
                          className="vj-secondary"
                          disabled={page === 0 || loading}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          Previous
                        </button>
                        <button
                          className="vj-secondary"
                          disabled={
                            (page + 1) * 30 >= snapshot.total || loading
                          }
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
          <footer className="vj-footer">
            Vine Branch Church · Member Care{" "}
            <span>People. Purpose. Belonging.</span>
          </footer>
        </main>
      </div>
      <nav className="vj-bottom-nav" aria-label="Quick navigation">
        {["overview", "visitors", "followups", "membership", "cfc"]
          .filter(
            (k) =>
              !caps ||
              caps.coordinator ||
              caps.friend ||
              ["overview", "cfc"].includes(k),
          )
          .map((key) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              aria-current={view === key ? "page" : undefined}
              onClick={() => navigate(key)}
            >
              <Icon name={key} />
              <span>
                {key === "membership"
                  ? "Joining"
                  : key === "cfc"
                    ? "CFC"
                    : labels[key]}
              </span>
            </button>
          ))}
        <button onClick={() => setMenu(true)}>
          <Icon name="settings" />
          <span>More</span>
        </button>
      </nav>
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        onPerson={(id) => {
          setView((v) => (v === "reports" ? "overview" : v));
          openPerson(id);
        }}
        sections={Object.entries(labels)
          .filter(
            ([key]) =>
              !caps ||
              caps.coordinator ||
              caps.friend ||
              ["overview", "cfc", "care"].includes(key),
          )
          .map(([key, label]) => ({ key, label, go: () => navigate(key) }))}
      />
      {toast && (
        <div className="vj-toast" role="status">
          <Icon name="check" />
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
      {error && !modal && (
        <Dialog
          title="We couldn’t load the journey"
          onClose={() => setError("")}
        >
          <div className="vj-dialog-body">
            <div role="alert" className="vj-error">
              {error}
            </div>
            <p>
              Your saved records have not been removed. Check your connection
              and try again.
            </p>
            <div className="vj-dialog-actions">
              <button className="vj-secondary" onClick={() => setError("")}>
                Close
              </button>
              <button
                className="vj-primary"
                onClick={() => {
                  setError("");
                  void load();
                }}
              >
                Try again
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {importing && (
        <JourneyImport
          onClose={() => setImporting(false)}
          onSaved={() => void load()}
        />
      )}
      {modal && snapshot && (
        <Dialog
          title={actionNames[modal]}
          busy={busy}
          onClose={() => setModal(null)}
        >
          <form ref={formRef} onSubmit={submit} className="vj-dialog-body">
            <fieldset disabled={busy}>
              <div className="vj-form-grid">{forms()}</div>
            </fieldset>
            {formError && (
              <div className="vj-error" role="alert">
                {formError}
              </div>
            )}
            <div className="vj-dialog-actions">
              <button
                type="button"
                className="vj-secondary"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button type="submit" className="vj-primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : modal === "join"
                    ? "Confirm official joining"
                    : "Save changes"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
