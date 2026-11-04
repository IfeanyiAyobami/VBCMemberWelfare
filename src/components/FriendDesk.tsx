"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StaffIdentity } from "@/lib/auth/types";
import {
  nextMembershipSunday,
  type JourneyDetail,
  type JourneyPerson,
  type JourneySnapshot,
} from "@/lib/journey/model";
import {
  clearFriendStorage,
  discardItem,
  enqueue,
  flushOutbox,
  loadDone,
  loadOutbox,
  recordDone,
  retryItem,
  type DoneItem,
  type OutboxItem,
} from "@/lib/journey/outbox";
import "./friend.css";

/* ---------- dates (church time is Africa/Lagos) ---------- */
const TZ = "Africa/Lagos";
const ymd = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const addDays = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (day: string) => new Date(day + "T12:00:00Z").getUTCDay();
const tenAm = (day: string) => day + "T09:00:00.000Z"; // 10:00 in Lagos
const nice = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(
    new Date(day + "T12:00:00Z"),
  );
const shortDate = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: TZ,
        day: "numeric",
        month: "short",
      }).format(new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso))
    : "";

/* The church's regular services. Recorded attendance counts whatever the day. */
const SERVICES = [
  { day: 0, name: "Sunday", label: "Sunday service" },
  { day: 2, name: "Tuesday", label: "Tuesday midweek service" },
  { day: 4, name: "Thursday", label: "Thursday midweek service" },
];
function serviceType(label: string, day: number, policy: string[]) {
  const lower = policy.map((p) => p.toLowerCase());
  const dayName = SERVICES.find((s) => s.day === day)!.name.toLowerCase();
  const exact = lower.findIndex((p) => p.includes(dayName));
  if (exact >= 0) return policy[exact];
  if (day !== 0) {
    const mid = lower.findIndex((p) => p.includes("midweek"));
    if (mid >= 0) return policy[mid];
  } else {
    const sun = lower.findIndex(
      (p) => p.includes("sunday") || p.includes("main"),
    );
    if (sun >= 0) return policy[sun];
  }
  return label;
}
function recentServices(today: string) {
  return SERVICES.map((s) => {
    let d = today;
    while (weekday(d) !== s.day) d = addDays(d, -1);
    return { ...s, date: d };
  }).sort((a, b) => b.date.localeCompare(a.date));
}
function nextServiceDay(today: string, day: number) {
  let d = today;
  while (weekday(d) !== day) d = addDays(d, 1);
  return d;
}

/* ---------- plain words ---------- */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const outcomeWords: Record<string, string> = {
  positive: "Spoke · it went well",
  undecided: "Spoke · not sure yet",
  no_answer: "No answer",
  unreachable: "Couldn't reach them",
  promised_return: "Spoke · coming to church",
  callback: "Asked for a call back",
  not_interested: "Not interested",
  no_further_contact: "Asked for no more contact",
};
function canContact(p: JourneyPerson) {
  return !!p.phone && p.contact_consent && p.followup_state === "active";
}
/** Plain-language reason a Friend cannot call or message someone, and what to do. */
function contactBlock(p: JourneyPerson) {
  if (p.followup_state !== "active")
    return {
      title: "Contact is paused.",
      text: "Please speak to your Coordinator before reaching out.",
    };
  if (!p.contact_consent)
    return {
      title: "No permission to contact.",
      text: "They haven't agreed to calls or messages. Ask your Coordinator.",
    };
  if (!p.phone)
    return {
      title: "No phone number recorded.",
      text: "Ask your Coordinator to add one, or note a conversation you had in person.",
    };
  return null;
}
function stage(p: JourneyPerson) {
  if (p.status === "member") return { text: "Member", tone: "ok" };
  if (p.membership_eligible) return { text: "Ready to join", tone: "ready" };
  if (!p.contact_count) return { text: "New visitor", tone: "new" };
  return { text: "Visitor", tone: "info" };
}
function guidance(p: JourneyPerson) {
  if (p.followup_state !== "active")
    return {
      reason: "Contact paused",
      todo: "Contact is paused for this person. Please speak to your Coordinator before reaching out.",
    };
  if (p.status === "member")
    return {
      reason: "New member · keep in touch",
      todo: "Check in and see how they are settling into the church family.",
    };
  if (!p.contact_count)
    return {
      reason:
        "New visitor" +
        (p.reported_first_visit
          ? " · came " + shortDate(p.reported_first_visit)
          : "") +
        " · say welcome",
      todo: "Call to welcome them and thank them for visiting.",
    };
  if (p.membership_eligible)
    return {
      reason: "Came twice · ready to join",
      todo:
        "Ask if they would like to join the church on Membership Sunday, " +
        nice(nextMembershipSunday(), { day: "numeric", month: "long" }) +
        ".",
    };
  return {
    reason: "Visitor · invite them back",
    todo: "Invite them to a Sunday or midweek service.",
  };
}
function due(p: JourneyPerson, today: string) {
  if (!p.next_due) return null;
  const day = ymd(new Date(p.next_due));
  if (day < today) {
    const late = Math.round(
      (Date.parse(today + "T12:00:00Z") - Date.parse(day + "T12:00:00Z")) /
        86400000,
    );
    return {
      text: late === 1 ? "1 day late" : late + " days late",
      tone: "late",
    };
  }
  if (day === today) return { text: "Today", tone: "today" };
  return {
    text: nice(day, { weekday: "short", day: "numeric", month: "short" }),
    tone: "later",
  };
}

/* ---------- small pieces ---------- */
function Sheet({
  open,
  label,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="fm-sheet"
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <span className="fm-grip" aria-hidden="true" />
      {open && children}
    </dialog>
  );
}
const PhoneIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinejoin="round"
  >
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  </svg>
);
function MobileIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    today: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
    people:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    done: "m8 12 3 3 5-6M22 12a10 10 0 1 1-4-8",
    help: "M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[kind] || paths.today} />
    </svg>
  );
}
const WaIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinejoin="round"
  >
    <path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.2 3.1Z" />
  </svg>
);
const waLink = (p: JourneyPerson) =>
  "https://wa.me/" + String(p.whatsapp || p.phone || "").replace(/\D/g, "");

type Step =
  | { kind: "reached" }
  | { kind: "spoke" }
  | { kind: "callback" }
  | { kind: "stop" }
  | { kind: "church" }
  | { kind: "failed" };

/* ---------- main ---------- */
export default function FriendDesk({
  staff,
  dark,
  onTheme,
  onFullView,
  onSignOut,
}: {
  staff: StaffIdentity;
  dark: boolean;
  onTheme: () => void;
  onFullView: () => void;
  onSignOut: () => void;
}) {
  const uid = staff.user_id;
  const [showAllStory, setShowAllStory] = useState(false);
  const [people, setPeople] = useState<JourneyPerson[]>([]),
    [policy, setPolicy] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [tab, setTab] = useState<"today" | "people" | "done" | "help">("today"),
    [search, setSearch] = useState(""),
    [peopleFilter, setPeopleFilter] = useState<"all" | "visitors" | "members">(
      "all",
    ),
    [openId, setOpenId] = useState<string | null>(null),
    [detail, setDetail] = useState<JourneyDetail | null>(null),
    [target, setTarget] = useState<JourneyPerson | null>(null),
    [step, setStep] = useState<Step | null>(null),
    [method, setMethod] = useState("phone"),
    [coming, setComing] = useState<string>(""),
    [nextChoice, setNextChoice] = useState<string>(""),
    [pickDate, setPickDate] = useState(""),
    [note, setNote] = useState(""),
    [stepError, setStepError] = useState(""),
    [churchChoice, setChurchChoice] = useState<string>(""),
    [earlierDate, setEarlierDate] = useState(""),
    [earlierService, setEarlierService] = useState("0"),
    [saved, setSaved] = useState<null | {
      itemId: string;
      person: JourneyPerson;
      next: string;
    }>(null),
    [outbox, setOutbox] = useState<OutboxItem[]>([]),
    [done, setDone] = useState<DoneItem[]>([]),
    [sending, setSending] = useState(false),
    [online, setOnline] = useState(true);
  const today = ymd(new Date());

  const refreshLocal = useCallback(() => {
    setOutbox(loadOutbox(uid));
    setDone(loadDone(uid));
  }, [uid]);

  const loadPeople = useCallback(async () => {
    try {
      const all: JourneyPerson[] = [];
      let total = Infinity;
      for (let page = 0; page < 5 && all.length < total; page++) {
        const params = new URLSearchParams({
          search: "",
          page: String(page),
          view: "all",
          stage: "all",
        });
        const r = await fetch("/api/journey?" + params, {
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });
        const x: JourneySnapshot & { message?: string } = await r.json();
        if (!r.ok) throw Error(x.message || "Unable to load your people.");
        all.push(...x.items);
        total = x.total;
        setPolicy(x.policy?.service_types || []);
        if (!x.items.length) break;
      }
      setPeople(all.filter((p) => p.assigned_to === uid));
      setLoadError("");
    } catch (e) {
      setLoadError(
        e instanceof Error && e.message
          ? e.message
          : "Unable to load your people.",
      );
    } finally {
      setLoading(false);
    }
  }, [uid]);

  const flush = useCallback(async () => {
    if (!loadOutbox(uid).some((i) => !i.error)) {
      refreshLocal();
      return;
    }
    setSending(true);
    const result = await flushOutbox(uid);
    setSending(false);
    refreshLocal();
    if (result.sent) void loadPeople();
  }, [uid, refreshLocal, loadPeople]);

  useEffect(() => {
    refreshLocal();
    void loadPeople();
    void flush();
    setOnline(navigator.onLine);
    const up = () => {
      setOnline(true);
      void flush();
    };
    const down = () => setOnline(false);
    const visible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    document.addEventListener("visibilitychange", visible);
    const t = setInterval(() => void flush(), 30000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", visible);
      clearInterval(t);
    };
  }, [refreshLocal, loadPeople, flush]);

  const openPerson = useCallback(async (id: string) => {
    setOpenId(id);
    setDetail(null);
    setShowAllStory(false);
    window.scrollTo({ top: 0 });
    try {
      const params = new URLSearchParams({
        search: "",
        page: "0",
        view: "all",
        stage: "all",
        memberId: id,
      });
      const r = await fetch("/api/journey?" + params, {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      const x = await r.json();
      if (r.ok) setDetail(x.detail);
    } catch {
      /* the person screen still works from the list data */
    }
  }, []);

  const pending = new Set(outbox.map((i) => i.memberId));
  const doneToday = new Set(done.map((d) => d.memberId));
  const groups = useMemo(() => {
    const sorted = [...people].sort(
      (a, b) =>
        (a.next_due ? Date.parse(a.next_due) : Infinity) -
        (b.next_due ? Date.parse(b.next_due) : Infinity),
    );
    const isToday = (p: JourneyPerson) =>
      !!p.next_due && ymd(new Date(p.next_due)) <= today;
    return {
      now: sorted.filter((p) => isToday(p) && p.followup_state === "active"),
      later: sorted.filter(
        (p) => !isToday(p) && !!p.next_due && p.followup_state === "active",
      ),
      other: sorted.filter((p) => !p.next_due || p.followup_state !== "active"),
    };
  }, [people, today]);

  const closeStep = (kind: Step["kind"]) =>
    setStep((s) => (s?.kind === kind ? null : s));
  function begin(
    p: JourneyPerson,
    how: string,
    kind: Step["kind"] = "reached",
  ) {
    setTarget(p);
    setMethod(how);
    setComing("");
    setNextChoice("");
    setPickDate("");
    setNote("");
    setStepError("");
    setChurchChoice("");
    setEarlierDate("");
    setStep({ kind } as Step);
  }

  function commit(
    p: JourneyPerson,
    action: "contact" | "attendance",
    data: Record<string, unknown>,
    summary: string,
    next: string,
  ) {
    const item = enqueue(uid, {
      memberId: p.member_id,
      name: p.name,
      action,
      data,
      summary,
    });
    recordDone(uid, {
      id: item.id,
      memberId: p.member_id,
      name: p.name,
      summary,
      at: new Date().toISOString(),
      sent: false,
    });
    // Show the change straight away, even before it reaches the server.
    if (action === "contact")
      setPeople((list) =>
        list.map((x) =>
          x.member_id === p.member_id
            ? {
                ...x,
                next_due: (data.nextDue as string) || null,
                contact_count: x.contact_count + 1,
              }
            : x,
        ),
      );
    setStep(null);
    setSaved({ itemId: item.id, person: p, next });
    refreshLocal();
    void flush();
  }

  function nextDueFrom(choice: string): string | null {
    if (choice === "tomorrow") return tenAm(addDays(today, 1));
    if (choice === "two_days") return tenAm(addDays(today, 2));
    if (choice === "next_week") return tenAm(addDays(today, 7));
    if (choice === "later_today")
      return new Date(Date.now() + 3 * 3600000).toISOString();
    if (choice === "after_service") {
      const s = SERVICES.find((x) => x.name === coming);
      if (s) return tenAm(addDays(nextServiceDay(today, s.day), 1));
    }
    if (choice === "pick" && pickDate) return new Date(pickDate).toISOString();
    return null;
  }
  const nextWords = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: TZ,
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(new Date(iso))
      : "";

  function saveSpoke() {
    if (!target) return;
    if (!coming)
      return setStepError("Choose whether they are coming to church.");
    if (!nextChoice) return setStepError("Choose when to check in again.");
    const nextDue = nextDueFrom(nextChoice);
    if (!nextDue) return setStepError("Pick a day to check in again.");
    const service = SERVICES.find((s) => s.name === coming);
    const outcome = service ? "promised_return" : "undecided";
    const lines = [
      service
        ? `Plans to come on ${service.name}.`
        : "Not sure yet about coming to church.",
      note.trim(),
    ].filter(Boolean);
    commit(
      target,
      "contact",
      {
        method,
        outcome,
        occurredAt: new Date().toISOString(),
        nextDue,
        note: lines.join(" "),
      },
      service ? `Spoke · coming on ${service.name}` : "Spoke · not sure yet",
      `${service ? `${firstName(target.name)} plans to come on ${service.name}. ` : ""}We'll remind you to check in on ${nextWords(nextDue)}.`,
    );
  }
  function saveNoAnswer(p: JourneyPerson) {
    const nextDue = tenAm(addDays(today, 1));
    commit(
      p,
      "contact",
      {
        method,
        outcome: "no_answer",
        occurredAt: new Date().toISOString(),
        nextDue,
        note: "",
      },
      "No answer",
      `We'll remind you to try ${firstName(p.name)} again tomorrow.`,
    );
  }
  function saveCallback() {
    if (!target) return;
    if (!nextChoice) return setStepError("Choose when to call back.");
    const nextDue = nextDueFrom(nextChoice);
    if (!nextDue) return setStepError("Pick a day and time to call back.");
    commit(
      target,
      "contact",
      {
        method,
        outcome: "callback",
        occurredAt: new Date().toISOString(),
        nextDue,
        note: note.trim(),
      },
      "Asked for a call back",
      `We'll remind you to call ${firstName(target.name)} back on ${nextWords(nextDue)}.`,
    );
  }
  function saveStop() {
    if (!target) return;
    if (note.trim().length < 3)
      return setStepError("Write a few words about what they said.");
    commit(
      target,
      "contact",
      {
        method,
        outcome: "no_further_contact",
        occurredAt: new Date().toISOString(),
        nextDue: "",
        note: note.trim(),
      },
      "Asked for no more contact",
      "The church will not contact them again. Thank you for respecting their wishes.",
    );
  }
  function saveChurch() {
    if (!target) return;
    let date = "",
      day = 0,
      label = "";
    if (churchChoice === "earlier") {
      if (!earlierDate || earlierDate > today)
        return setStepError("Choose the date of the service.");
      date = earlierDate;
      day = Number(earlierService);
      label = SERVICES.find((s) => s.day === day)!.label;
    } else {
      const s = recentServices(today).find((x) => x.date === churchChoice);
      if (!s) return setStepError("Choose the service they came to.");
      date = s.date;
      day = s.day;
      label = s.label;
    }
    commit(
      target,
      "attendance",
      {
        date,
        serviceKey: label,
        serviceType: serviceType(label, day, policy),
        source: "church_staff",
        verification: "independently_confirmed",
        note: `Recorded by Follow-through Friend ${staff.display_name} in Friend mode.`,
      },
      `Came to church · ${label}, ${shortDate(date)}`,
      `${firstName(target.name)}'s visit is added to their journey.`,
    );
  }

  /* ---------- rendering helpers ---------- */
  const actionButtons = (p: JourneyPerson, big = false) =>
    canContact(p) ? (
      <div className={"fm-actions" + (big ? " fm-actions-big" : "")}>
        <a
          className="fm-call"
          href={"tel:" + p.phone}
          onClick={() => setTimeout(() => begin(p, "phone"), 400)}
        >
          <PhoneIcon /> Call
        </a>
        <a
          className="fm-wa"
          href={waLink(p)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setTimeout(() => begin(p, "whatsapp"), 400)}
        >
          <WaIcon /> WhatsApp
        </a>
      </div>
    ) : null;

  const card = (p: JourneyPerson) => {
    const d = due(p, today),
      g = guidance(p);
    return (
      <article key={p.member_id} className="fm-card">
        <button
          className="fm-card-open"
          onClick={() => void openPerson(p.member_id)}
        >
          <span className="fm-avatar" aria-hidden="true">
            {initials(p.name)}
          </span>
          <span className="fm-card-text">
            <strong>{p.name}</strong>
            <span>{g.reason}</span>
            {pending.has(p.member_id) && (
              <span className="fm-wait">Update waiting to send</span>
            )}
            {!pending.has(p.member_id) && doneToday.has(p.member_id) && (
              <span className="fm-done-tag">Done today ✓</span>
            )}
          </span>
          {d && <span className={"fm-pill fm-" + d.tone}>{d.text}</span>}
        </button>
        {actionButtons(p)}
        {!canContact(p) && contactBlock(p) && (
          <>
            <p className="fm-blocked">
              <strong>{contactBlock(p)!.title}</strong> {contactBlock(p)!.text}
            </p>
            {p.followup_state === "active" && (
              <button
                className="fm-secondary"
                onClick={() => begin(p, "in_person")}
              >
                We talked in person
              </button>
            )}
          </>
        )}
      </article>
    );
  };

  const waiting = outbox.filter((i) => !i.error),
    failed = outbox.filter((i) => i.error);
  const banner =
    waiting.length || failed.length ? (
      <div className="fm-banners">
        {waiting.length > 0 && (
          <div className="fm-banner fm-banner-wait" role="status">
            <span>
              {waiting.length === 1
                ? "1 update is"
                : `${waiting.length} updates are`}{" "}
              waiting to send. They are safe on this phone
              {online ? "" : " until the network is back"}.
            </span>
            <button onClick={() => void flush()} disabled={sending}>
              {sending ? "Sending…" : "Send now"}
            </button>
          </div>
        )}
        {failed.length > 0 && (
          <div className="fm-banner fm-banner-fail" role="alert">
            <span>
              {failed.length === 1 ? "1 update" : `${failed.length} updates`}{" "}
              could not be saved.
            </span>
            <button onClick={() => setStep({ kind: "failed" })}>Review</button>
          </div>
        )}
      </div>
    ) : null;

  const person = openId
    ? people.find((p) => p.member_id === openId) || detail?.person || null
    : null;

  /* ---------- screens ---------- */
  let screen: React.ReactNode;
  if (saved) {
    const stillWaiting = outbox.some((i) => i.id === saved.itemId);
    const nextPerson = groups.now.find(
      (p) =>
        p.member_id !== saved.person.member_id &&
        !doneToday.has(p.member_id) &&
        canContact(p),
    );
    const left = groups.now.filter(
      (p) =>
        !doneToday.has(p.member_id) && p.member_id !== saved.person.member_id,
    ).length;
    screen = (
      <main className="fm-main fm-saved" aria-labelledby="fm-saved-h">
        <span
          className={
            "fm-tick" + (stillWaiting && !sending ? " fm-tick-wait" : "")
          }
          aria-hidden="true"
        >
          {stillWaiting && !sending ? "⏳" : "✓"}
        </span>
        <h1 id="fm-saved-h">
          {sending && stillWaiting
            ? "Saving…"
            : stillWaiting
              ? "Kept safe on this phone."
              : `Saved. Thank you, ${firstName(staff.display_name)}.`}
        </h1>
        {stillWaiting && !sending && (
          <p className="fm-note-wait">
            It will send by itself when the network is back. You can keep going.
          </p>
        )}
        <p>{saved.next}</p>
        {nextPerson && (
          <section className="fm-card fm-next" aria-label="Next person">
            <span className="fm-label">NEXT PERSON · {left} LEFT TODAY</span>
            <button
              className="fm-card-open"
              onClick={() => {
                setSaved(null);
                void openPerson(nextPerson.member_id);
              }}
            >
              <span className="fm-avatar" aria-hidden="true">
                {initials(nextPerson.name)}
              </span>
              <span className="fm-card-text">
                <strong>{nextPerson.name}</strong>
                <span>{guidance(nextPerson).reason}</span>
              </span>
            </button>
            {actionButtons(nextPerson)}
          </section>
        )}
        <button
          className="fm-link"
          onClick={() => {
            setSaved(null);
            setOpenId(null);
            setTab("people");
          }}
        >
          Back to my people
        </button>
      </main>
    );
  } else if (person) {
    const g = guidance(person),
      s = stage(person);
    const story: { at: string; title: string; text?: string; done: boolean }[] =
      [];
    if (person.reported_first_visit || person.first_visit_on)
      story.push({
        at: (person.first_visit_on || person.reported_first_visit)!,
        title: "First came",
        done: true,
      });
    for (const a of detail?.attendance || [])
      if (!a.voided_at && a.service_date)
        story.push({
          at: a.service_date,
          title: "Came to church",
          text: a.service_key || a.service_type || "",
          done: true,
        });
    for (const c of (detail?.contacts || []).slice(0, 6))
      if (c.occurred_at)
        story.push({
          at: c.occurred_at,
          title: outcomeWords[c.outcome || ""] || "Contacted",
          text: c.note || "",
          done: true,
        });
    story.sort((a, b) => a.at.localeCompare(b.at));
    if (person.official_joined_on)
      story.push({
        at: person.official_joined_on,
        title: "Joined the church",
        done: true,
      });
    else if (person.membership_eligible)
      story.push({
        at: nextMembershipSunday(),
        title: "Can join on Membership Sunday",
        done: false,
      });
    screen = (
      <main className="fm-main fm-person" aria-labelledby="fm-person-h">
        <button
          className="fm-back"
          onClick={() => {
            setOpenId(null);
            setDetail(null);
          }}
        >
          ‹ My people
        </button>
        <header className="fm-person-head">
          <span className="fm-avatar fm-avatar-lg" aria-hidden="true">
            {initials(person.name)}
          </span>
          <div>
            <h1 id="fm-person-h">{person.name}</h1>
            <span className={"fm-pill fm-" + s.tone}>{s.text}</span>
          </div>
        </header>
        <section className="fm-todo">
          <span className="fm-label">WHAT TO DO</span>
          <p>{g.todo}</p>
        </section>
        {pending.has(person.member_id) && (
          <p className="fm-wait fm-wait-block">
            An update for {firstName(person.name)} is waiting to send. It is
            safe on this phone.
          </p>
        )}
        <button
          className="fm-big fm-big-church"
          onClick={() => begin(person, "in_person", "church")}
        >
          <span className="fm-ic" aria-hidden="true">
            ⛪
          </span>
          <span>
            {firstName(person.name)} came to church
            <small>Sunday or midweek · counts straight away</small>
          </span>
        </button>
        <button className="fm-big" onClick={() => begin(person, "in_person")}>
          <span className="fm-ic" aria-hidden="true">
            💬
          </span>
          <span>
            We talked in person
            <small>Record a conversation without calling</small>
          </span>
        </button>
        <section className="fm-story" aria-labelledby="fm-story-h">
          <div className="fm-story-head">
            <h2 id="fm-story-h">
              {showAllStory
                ? `${firstName(person.name)}\u2019s journey so far`
                : "Latest on their journey"}
            </h2>
            {story.filter((x) => x.done).length > 3 && (
              <span className="fm-muted">
                {story.filter((x) => x.done).length} entries
              </span>
            )}
          </div>
          {!detail && <p className="fm-muted">Loading their story…</p>}
          {detail && !story.length && (
            <p className="fm-muted">
              Nothing recorded yet. Your first call starts the story.
            </p>
          )}
          <ol>
            {(showAllStory
              ? story
              : [
                  ...story.filter((x) => !x.done),
                  ...story
                    .filter((x) => x.done)
                    .slice(-3)
                    .reverse(),
                ]
            ).map((x, i) => (
              <li key={i} className={x.done ? "" : "fm-future"}>
                <span className="fm-dot" aria-hidden="true">
                  {x.done ? "✓" : i + 1}
                </span>
                <span>
                  <strong>{x.title}</strong> · {shortDate(x.at)}
                  {x.text && <span className="fm-quote">{x.text}</span>}
                </span>
              </li>
            ))}
          </ol>
          {story.filter((x) => x.done).length > 3 && (
            <button
              className="fm-secondary fm-story-toggle"
              onClick={() => setShowAllStory((v) => !v)}
              aria-expanded={showAllStory}
            >
              {showAllStory
                ? "Show latest only"
                : `Show all ${story.filter((x) => x.done).length}`}
            </button>
          )}
        </section>
        <button className="fm-link" onClick={onFullView}>
          More options (full view)
        </button>
        {canContact(person) && (
          <div className="fm-pinned">{actionButtons(person, true)}</div>
        )}
      </main>
    );
  } else if (tab === "done") {
    screen = (
      <main className="fm-main" aria-labelledby="fm-done-h">
        <h1 id="fm-done-h" className="fm-title">
          DONE TODAY
        </h1>
        <p className="fm-muted">
          Your updates today. Pending updates send when your connection returns.
        </p>
        {banner}
        {!done.length && (
          <p className="fm-muted">Nothing recorded yet today.</p>
        )}
        <ul className="fm-list">
          {done.map((d) => {
            const isWaiting = outbox.some((i) => i.id === d.id && !i.error);
            const isFailed = outbox.some((i) => i.id === d.id && i.error);
            return (
              <li key={d.id} className="fm-card fm-done-row">
                <span>
                  <strong>{d.name}</strong>
                  <span>{d.summary}</span>
                </span>
                <span
                  className={
                    "fm-pill " +
                    (isFailed ? "fm-late" : isWaiting ? "fm-today" : "fm-ok")
                  }
                >
                  {isFailed
                    ? "Not saved"
                    : isWaiting
                      ? "Waiting to send"
                      : "Sent"}
                </span>
              </li>
            );
          })}
        </ul>
      </main>
    );
  } else if (tab === "help") {
    screen = (
      <main className="fm-main fm-help" aria-labelledby="fm-help-h">
        <h1 id="fm-help-h" className="fm-title">
          MY ACCOUNT
        </h1>
        <div className="fm-card">
          <strong>{staff.display_name}</strong>
          <span className="fm-muted">
            Follow Through Friend · Assigned people only
          </span>
        </div>
        <h2 className="fm-label">QUICK GUIDE</h2>
        <ol className="fm-steps">
          <li>
            <strong>Tap Call or WhatsApp</strong> next to a person.
          </li>
          <li>
            <strong>When you come back,</strong> answer one or two quick
            questions.
          </li>
          <li>
            <strong>Press Save.</strong> That&rsquo;s it — the church office
            sees it.
          </li>
        </ol>
        <p>
          <strong>No network?</strong> Save anyway. Your update is kept on this
          phone and sends by itself later.
        </p>
        <p>
          <strong>Saw someone at church?</strong> Open their name and tap
          &ldquo;came to church&rdquo;.
        </p>
        <div className="fm-help-actions">
          <button className="fm-secondary" onClick={onTheme}>
            {dark ? "Use light colours" : "Use dark colours"}
          </button>
          <button className="fm-secondary" onClick={onFullView}>
            Switch to full view
          </button>
          <button
            className="fm-secondary"
            onClick={() => {
              const left = loadOutbox(uid).length;
              if (
                left &&
                !confirm(
                  `${left} update(s) have not been sent yet. If you sign out now they will be lost. Sign out anyway?`,
                )
              )
                return;
              clearFriendStorage(uid);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      </main>
    );
  } else {
    const outstanding = groups.now.filter((p) => !doneToday.has(p.member_id));
    const overdue = outstanding.filter((p) => due(p, today)?.tone === "late");
    const firstContacts = groups.other.filter(
      (p) =>
        p.followup_state === "active" &&
        !p.contact_count &&
        !doneToday.has(p.member_id),
    );
    const filtered = people.filter(
      (p) =>
        (peopleFilter === "all" ||
          (peopleFilter === "members"
            ? p.status === "member"
            : p.status !== "member")) &&
        (p.name + " " + (p.phone || "") + " " + (p.email || ""))
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    );
    screen = (
      <main className="fm-main" aria-labelledby="fm-home-h">
        <p className="fm-greeting">Hello, {firstName(staff.display_name)}</p>
        <h1 id="fm-home-h" className="fm-title">
          {tab === "today" ? "TODAY" : "MY PEOPLE"}
        </h1>
        <p className="fm-lead">
          {tab === "today"
            ? nice(today, { weekday: "long", day: "numeric", month: "long" })
            : `${people.length} people in your care`}
        </p>
        {!online && (
          <p className="fm-offline" role="status">
            No network. You can still record updates — they will send later.
          </p>
        )}
        {loadError && (
          <p className="fm-error" role="alert">
            {loadError}{" "}
            <button
              className="fm-link"
              onClick={() => {
                setLoading(true);
                void loadPeople();
              }}
            >
              Try again
            </button>
          </p>
        )}
        {banner}
        {loading ? (
          <p role="status">Loading your people…</p>
        ) : tab === "today" ? (
          <>
            <p className="fm-summary" aria-label="Your care summary">
              {outstanding.length ? (
                <>
                  <strong>
                    {outstanding.length === 1
                      ? "1 to contact today"
                      : `${outstanding.length} to contact today`}
                  </strong>
                  {overdue.length > 0 && (
                    <>
                      {" · "}
                      <span className="fm-late-text">
                        {overdue.length === 1
                          ? "1 is late"
                          : `${overdue.length} are late`}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <strong>You&rsquo;re up to date</strong>
              )}
              {" · "}
              <button className="fm-link fm-inline" onClick={() => setTab("people")}>
                {people.length === 1 ? "1 person" : `${people.length} people`} in your care
              </button>
            </p>
            <h2 id="fm-attention" className="fm-label">
              NEEDS YOUR ATTENTION
            </h2>
            {outstanding.map(card)}
            {!outstanding.length && (
              <div className="fm-card">
                <strong>No contacts due right now</strong>
                <span className="fm-muted">
                  Open My people to check in or record a church visit.
                </span>
                <button
                  className="fm-secondary"
                  onClick={() => setTab("people")}
                >
                  View my people →
                </button>
              </div>
            )}
            {!!firstContacts.length && (
              <>
                <h2 className="fm-label">FIRST CONTACT · NO DATE SET</h2>
                {firstContacts.map(card)}
              </>
            )}
            {!!groups.later.length && (
              <>
                <h2 className="fm-label">COMING UP</h2>
                {groups.later.slice(0, 3).map(card)}
              </>
            )}
            {!people.length && (
              <p className="fm-muted">
                No one is assigned to you yet. Your Coordinator will add people.
              </p>
            )}
          </>
        ) : (
          <>
            <label className="fm-field">
              <span className="fm-muted">Find a person</span>
              <input
                type="search"
                placeholder="Search name or phone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="fm-filters" role="group" aria-label="Filter people">
              {(
                [
                  ["all", "All"],
                  ["visitors", "Guests"],
                  ["members", "Members"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={peopleFilter === value}
                  className={peopleFilter === value ? "on" : ""}
                  onClick={() => setPeopleFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {filtered.map(card)}
            {!filtered.length && (
              <div className="fm-card">
                <p className="fm-muted">
                  {people.length
                    ? "No people match this search or filter."
                    : "No one is assigned to you yet. Your Coordinator will add people."}
                </p>
              </div>
            )}
            <button className="fm-secondary" onClick={onFullView}>
              Register / import people
            </button>
          </>
        )}
      </main>
    );
  }

  const name = target ? firstName(target.name) : "";
  const services = recentServices(today);
  const methodPicker = (
    <div className="fm-method" role="radiogroup" aria-label="How did you talk?">
      {[
        ["phone", "Phone call"],
        ["whatsapp", "WhatsApp"],
        ["in_person", "In person"],
      ].map(([v, l]) => (
        <button
          key={v}
          role="radio"
          aria-checked={method === v}
          className={method === v ? "on" : ""}
          onClick={() => setMethod(v)}
        >
          {l}
        </button>
      ))}
    </div>
  );
  const choice = (
    value: string,
    current: string,
    set: (v: string) => void,
    label: string,
  ) => (
    <button
      role="radio"
      aria-checked={current === value}
      className={"fm-chip" + (current === value ? " on" : "")}
      onClick={() => {
        set(value);
        setStepError("");
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="fm-app">
      <header className="fm-top">
        <img src="/assets/image-7d4e31b34082.png" alt="Vine Branch Church" />
        <div>
          <span>VINE BRANCH CHURCH</span>
          <strong>{staff.display_name}</strong>
        </div>
        <button
          className="fm-theme"
          onClick={onTheme}
          aria-label={dark ? "Use light colours" : "Use dark colours"}
        >
          {dark ? "☀" : "☾"}
        </button>
        <span className="fm-avatar" aria-hidden="true">
          {initials(staff.display_name)}
        </span>
      </header>

      {screen}

      {!saved && !person && (
        <nav className="fm-tabs" aria-label="Friend mode">
          {(
            [
              ["today", "Today"],
              ["people", "My people"],
              ["done", "Done today"],
              ["help", "Account"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              aria-current={tab === k ? "page" : undefined}
              className={tab === k ? "on" : ""}
              onClick={() => setTab(k)}
            >
              <MobileIcon kind={k} />
              <span>{l}</span>
              {k === "done" && waiting.length > 0 && (
                <b aria-label={`${waiting.length} waiting`}>{waiting.length}</b>
              )}
            </button>
          ))}
        </nav>
      )}

      <Sheet
        open={step?.kind === "reached"}
        label="Record the conversation"
        onClose={() => closeStep("reached")}
      >
        {target && (
          <div className="fm-sheet-body">
            {methodPicker}
            <h2 className="fm-q">
              {method === "in_person"
                ? `How did it go with ${name}?`
                : `Did you reach ${name}?`}
            </h2>
            <div className="fm-stack">
              <button
                className="fm-big"
                onClick={() => setStep({ kind: "spoke" })}
              >
                <span className="fm-ic fm-ic-ok" aria-hidden="true">
                  ✓
                </span>
                <span>
                  Yes, we spoke<small>Tell us how it went next</small>
                </span>
              </button>
              {method !== "in_person" && (
                <button className="fm-big" onClick={() => saveNoAnswer(target)}>
                  <span className="fm-ic" aria-hidden="true">
                    –
                  </span>
                  <span>
                    No answer<small>We&rsquo;ll remind you tomorrow</small>
                  </span>
                </button>
              )}
              <button
                className="fm-big"
                onClick={() => setStep({ kind: "callback" })}
              >
                <span className="fm-ic fm-ic-wait" aria-hidden="true">
                  ↻
                </span>
                <span>
                  Asked me to call back<small>Pick a time next</small>
                </span>
              </button>
              <button
                className="fm-big"
                onClick={() => setStep({ kind: "stop" })}
              >
                <span className="fm-ic fm-ic-stop" aria-hidden="true">
                  ✕
                </span>
                <span>
                  Doesn&rsquo;t want contact
                  <small>The church will stop all messages</small>
                </span>
              </button>
            </div>
            <button className="fm-link" onClick={() => setStep(null)}>
              Not now
            </button>
          </div>
        )}
      </Sheet>

      <Sheet
        open={step?.kind === "spoke"}
        label="How it went"
        onClose={() => closeStep("spoke")}
      >
        {target && (
          <div className="fm-sheet-body">
            <button
              className="fm-back"
              onClick={() => setStep({ kind: "reached" })}
            >
              ‹ Back
            </button>
            <h2 className="fm-q" id="fm-q-coming">
              Is {name} coming to church?
            </h2>
            <div
              className="fm-grid"
              role="radiogroup"
              aria-labelledby="fm-q-coming"
            >
              {SERVICES.map((s) => choice(s.name, coming, setComing, s.name))}
              {choice(
                "not_sure",
                coming,
                (v) => {
                  setComing(v);
                  if (nextChoice === "after_service") setNextChoice("");
                },
                "Not sure",
              )}
            </div>
            <h2 className="fm-q" id="fm-q-next">
              When should you check in again?
            </h2>
            <div
              className="fm-grid"
              role="radiogroup"
              aria-labelledby="fm-q-next"
            >
              {choice("tomorrow", nextChoice, setNextChoice, "Tomorrow")}
              {coming && coming !== "not_sure"
                ? choice(
                    "after_service",
                    nextChoice,
                    setNextChoice,
                    `After ${coming}`,
                  )
                : choice("two_days", nextChoice, setNextChoice, "In 2 days")}
              {choice("next_week", nextChoice, setNextChoice, "Next week")}
              {choice("pick", nextChoice, setNextChoice, "Pick a day")}
            </div>
            {nextChoice === "pick" && (
              <label className="fm-field">
                Day and time
                <input
                  type="datetime-local"
                  value={pickDate}
                  onChange={(e) => setPickDate(e.target.value)}
                />
              </label>
            )}
            <label className="fm-field">
              Anything to remember? <span className="fm-muted">(optional)</span>
              <textarea
                rows={2}
                maxLength={1500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <small className="fm-muted">
                Tip: tap the microphone on your keyboard to speak instead of
                typing.
              </small>
            </label>
            {stepError && (
              <p className="fm-error" role="alert">
                {stepError}
              </p>
            )}
            <button className="fm-save" onClick={saveSpoke}>
              Save
            </button>
          </div>
        )}
      </Sheet>

      <Sheet
        open={step?.kind === "callback"}
        label="Call back"
        onClose={() => closeStep("callback")}
      >
        {target && (
          <div className="fm-sheet-body">
            <button
              className="fm-back"
              onClick={() => setStep({ kind: "reached" })}
            >
              ‹ Back
            </button>
            <h2 className="fm-q" id="fm-q-cb">
              When should you call {name} back?
            </h2>
            <div
              className="fm-grid"
              role="radiogroup"
              aria-labelledby="fm-q-cb"
            >
              {choice("later_today", nextChoice, setNextChoice, "Later today")}
              {choice("tomorrow", nextChoice, setNextChoice, "Tomorrow")}
              {choice("two_days", nextChoice, setNextChoice, "In 2 days")}
              {choice("pick", nextChoice, setNextChoice, "Pick a time")}
            </div>
            {nextChoice === "pick" && (
              <label className="fm-field">
                Day and time
                <input
                  type="datetime-local"
                  value={pickDate}
                  onChange={(e) => setPickDate(e.target.value)}
                />
              </label>
            )}
            <label className="fm-field">
              Anything to remember? <span className="fm-muted">(optional)</span>
              <textarea
                rows={2}
                maxLength={1500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {stepError && (
              <p className="fm-error" role="alert">
                {stepError}
              </p>
            )}
            <button className="fm-save" onClick={saveCallback}>
              Save
            </button>
          </div>
        )}
      </Sheet>

      <Sheet
        open={step?.kind === "stop"}
        label="No more contact"
        onClose={() => closeStep("stop")}
      >
        {target && (
          <div className="fm-sheet-body">
            <button
              className="fm-back"
              onClick={() => setStep({ kind: "reached" })}
            >
              ‹ Back
            </button>
            <h2 className="fm-q">{name} doesn&rsquo;t want to be contacted</h2>
            <p>
              The church will stop all calls and messages to {name}. Your
              Coordinator will see this.
            </p>
            <label className="fm-field">
              What did they say?
              <textarea
                rows={3}
                maxLength={1500}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setStepError("");
                }}
              />
            </label>
            {stepError && (
              <p className="fm-error" role="alert">
                {stepError}
              </p>
            )}
            <button className="fm-save" onClick={saveStop}>
              Save
            </button>
          </div>
        )}
      </Sheet>

      <Sheet
        open={step?.kind === "church"}
        label="Came to church"
        onClose={() => closeStep("church")}
      >
        {target && (
          <div className="fm-sheet-body">
            <h2 className="fm-q" id="fm-q-church">
              Which service did {name} come to?
            </h2>
            <div
              className="fm-stack"
              role="radiogroup"
              aria-labelledby="fm-q-church"
            >
              {services.map((s) => (
                <button
                  key={s.date}
                  role="radio"
                  aria-checked={churchChoice === s.date}
                  className={"fm-big" + (churchChoice === s.date ? " on" : "")}
                  onClick={() => {
                    setChurchChoice(s.date);
                    setStepError("");
                  }}
                >
                  <span className="fm-ic" aria-hidden="true">
                    ⛪
                  </span>
                  <span>
                    {s.day === 0 ? "Sunday service" : `${s.name} midweek`}
                    {s.date === today ? " · today" : ""}
                    <small>
                      {nice(s.date, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </small>
                  </span>
                </button>
              ))}
              <button
                role="radio"
                aria-checked={churchChoice === "earlier"}
                className={"fm-big" + (churchChoice === "earlier" ? " on" : "")}
                onClick={() => setChurchChoice("earlier")}
              >
                <span className="fm-ic" aria-hidden="true">
                  📅
                </span>
                <span>An earlier service</span>
              </button>
            </div>
            {churchChoice === "earlier" && (
              <div className="fm-two">
                <label className="fm-field">
                  Date
                  <input
                    type="date"
                    max={today}
                    value={earlierDate}
                    onChange={(e) => setEarlierDate(e.target.value)}
                  />
                </label>
                <label className="fm-field">
                  Service
                  <select
                    value={earlierService}
                    onChange={(e) => setEarlierService(e.target.value)}
                  >
                    {SERVICES.map((s) => (
                      <option key={s.day} value={s.day}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <p className="fm-muted">
              Your word counts. It&rsquo;s added to {name}&rsquo;s journey
              straight away, with your name on it.
            </p>
            {stepError && (
              <p className="fm-error" role="alert">
                {stepError}
              </p>
            )}
            <button className="fm-save" onClick={saveChurch}>
              Save
            </button>
          </div>
        )}
      </Sheet>

      <Sheet
        open={step?.kind === "failed"}
        label="Updates that could not be saved"
        onClose={() => closeStep("failed")}
      >
        <div className="fm-sheet-body">
          <h2 className="fm-q">Updates that could not be saved</h2>
          {!failed.length && <p>All updates are sorted.</p>}
          {failed.map((i) => (
            <div key={i.id} className="fm-card fm-failed">
              <strong>{i.name}</strong>
              <span>{i.summary}</span>
              <span className="fm-error">{i.error}</span>
              <div className="fm-two">
                <button
                  className="fm-secondary"
                  onClick={() => {
                    retryItem(uid, i.id);
                    refreshLocal();
                    void flush();
                  }}
                >
                  Try again
                </button>
                <button
                  className="fm-secondary"
                  onClick={() => {
                    if (confirm("Remove this update? It will not be saved.")) {
                      discardItem(uid, i.id);
                      refreshLocal();
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button className="fm-link" onClick={() => setStep(null)}>
            Close
          </button>
        </div>
      </Sheet>
    </div>
  );
}
