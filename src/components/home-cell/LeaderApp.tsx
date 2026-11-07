"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cell, Meeting, Membership, Person, RoleHolder, WorkspaceData } from "@/lib/home-cell/model";
import {
  absent,
  addDays,
  areaStatus,
  came,
  editable,
  findPhone,
  finished,
  holders,
  initials,
  lastCame,
  lastMeetingDate,
  longDate,
  missedTwo,
  naira,
  personName,
  plainError,
  sameWeek,
  shortDate,
  timeRange,
  todayIso,
  total,
  visitName,
  waLink,
  weekView,
  type WeekView,
} from "@/lib/home-cell/leader-week";
import "./leader-app.css";

type Kind = "offering" | "dues" | "expense";
type Screen =
  | { name: "home" }
  | { name: "hub"; cellId: string }
  | { name: "attendance"; cellId: string }
  | { name: "visitors"; cellId: string }
  | { name: "visitorForm"; cellId: string }
  | { name: "money"; cellId: string; kind: Kind }
  | { name: "send"; cellId: string }
  | { name: "noMeeting"; cellId: string; date: string }
  | { name: "sent"; cellId: string; noMeeting?: boolean }
  | { name: "people" }
  | { name: "cells" }
  | { name: "checkOn" }
  | { name: "review"; meetingId: string }
  | { name: "sendBack"; meetingId: string }
  | { name: "approved"; meetingId: string }
  | { name: "help" };

const KIND_LABEL: Record<Kind, string> = { offering: "Offering", dues: "Dues", expense: "Expenses" };

/* ---------- icons ---------- */
const P: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  people: "M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6 6 0 0 1 3.5 5.5",
  cells: "M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5M9.5 20v-5h5v5",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  wa: "M3.5 20.5 5 16a8.5 8.5 0 1 1 3.2 3.1Z",
  check: "M5 12.5l4.5 4.5L19 7",
  next: "m9 5 7 7-7 7",
  back: "m15 5-7 7 7 7",
  send: "m3 11 18-8-8 18-2-8z",
  plus: "M12 5v14M5 12h14",
  money: "M2.5 6h19v12h-19zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5",
  card: "M3 5h18v14H3zM3 10h18M7 15h4",
  out: "M12 3v12M7 10l5 5 5-5M4 21h16",
  cal: "M3 4.5h18v16H3zM8 2.5v4M16 2.5v4M3 10h18",
  ret: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  sun: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8v5M12 16v.01",
};
const Icon = ({ n, s = 22 }: { n: string; s?: number }) => (
  <svg aria-hidden="true" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={P[n]} />
  </svg>
);

/* ---------- main ---------- */
export default function LeaderApp() {
  const [data, setData] = useState<WorkspaceData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [screen, setScreen] = useState<Screen>({ name: "home" }),
    [tab, setTab] = useState<"week" | "people" | "help">("week"),
    [dark, setDark] = useState(false);

  useEffect(() => {
    try {
      setDark(localStorage.getItem("hco-reference-theme") === "dark");
    } catch {
      /* light by default */
    }
  }, []);
  const toggleTheme = () => {
    setDark((d) => {
      try {
        localStorage.setItem("hco-reference-theme", d ? "light" : "dark");
      } catch {
        /* preference only */
      }
      return !d;
    });
  };

  const load = useCallback(async () => {
    const today = todayIso();
    const params = new URLSearchParams({ from: addDays(today, -63), to: addDays(today, 8) });
    try {
      const r = await fetch("/api/home-cell/workspace?" + params, { cache: "no-store" });
      const x = await r.json();
      if (r.status === 403) {
        location.assign("/home-cell/login");
        return;
      }
      if (!r.ok) throw Error(x.message);
      setData(x);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Couldn't load. Check your network and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const go = (s: Screen) => {
    setError("");
    setScreen(s);
    window.scrollTo({ top: 0 });
  };
  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/home-cell/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const x = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (String(x.message || "").includes("STALE")) void load();
      throw Error(plainError(String(x.message || "")));
    }
    return x.result;
  }
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message === "Failed to fetch"
            ? "No network. Please try again when you're connected."
            : e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function ensureMeeting(w: WeekView) {
    if (w.meeting) return w.meeting;
    return (await post({ action: "meeting", cell_id: w.cell.id, meeting_date: w.date })) as {
      id: string;
      version: number;
      notes: string | null;
    };
  }

  /* ----- roles ----- */
  const userId = data?.userId || "";
  const myCells = useMemo(
    () =>
      data
        ? data.cells.filter((c) =>
            data.assignments.some((a) => a.role === "cell_leader" && a.cell_id === c.id),
          )
        : [],
    [data],
  );
  const myAreas = useMemo(
    () =>
      data
        ? [...new Set(data.assignments.filter((a) => a.role === "area_leader" && a.area_id).map((a) => a.area_id as string))]
        : [],
    [data],
  );
  const areaCells = useMemo(
    () => (data ? data.cells.filter((c) => myAreas.includes(c.area_id)) : []),
    [data, myAreas],
  );
  const isCell = myCells.length > 0,
    isArea = myAreas.length > 0;
  const today = todayIso();
  const cellById = (id: string) => data?.cells.find((c) => c.id === id) as Cell;
  const currentWeek = (cell: Cell) => weekView(data!, cell, lastMeetingDate(cell, today));
  const reviewQueue = useMemo(() => {
    if (!data) return [];
    const ids = new Set([...(data.approvable || []), ...(data.reviewable || [])]);
    return data.meetings
      .filter((m) => m.status === "submitted" && ids.has(m.id) && myAreas.includes(cellById(m.cell_id)?.area_id))
      .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, myAreas]);
  const coordinators = (areaId?: string) =>
    data ? holders(data, "coordinator", (r) => (areaId ? r.area_id === areaId : myAreas.concat(myCells.map((c) => c.area_id)).includes(r.area_id || ""))) : [];
  const leaderOf = (cellId: string) => (data ? holders(data, "cell_leader", (r) => r.cell_id === cellId)[0] : undefined);
  const areaName = (id: string) => data?.areas.find((a) => a.id === id)?.name || "Your area";

  /* ----- shared pieces ----- */
  const Header = ({ sub, back, onBack }: { sub: string; back?: string; onBack?: () => void }) => (
    <header className="lx-top">
      {back && (
        <button className="lx-back" onClick={onBack || (() => go({ name: "home" }))}>
          <Icon n="back" />
          <span>{back}</span>
        </button>
      )}
      <div className="lx-brand">
        {!back && <img src="/assets/image-7d4e31b34082.png" alt="" />}
        <span>
          <small>{sub}</small>
          <b>Vine Branch Church</b>
        </span>
      </div>
      <button className="lx-theme" onClick={toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>
        <Icon n={dark ? "sun" : "moon"} s={20} />
      </button>
    </header>
  );
  const coord = coordinators(myCells[0]?.area_id || myAreas[0])[0];
  const HelpBar = () => (
    <button className="lx-helpbar" onClick={() => go({ name: "help" })}>
      <Icon n="phone" s={20} />
      <span>
        Stuck? <b>Call your Coordinator</b>
      </span>
    </button>
  );
  const Alert = () =>
    error ? (
      <p className="lx-alert" role="alert">
        {error}
      </p>
    ) : null;
  const Tabs = () => {
    const items: [typeof tab, string, string][] = [
      ["week", "This week", "home"],
      ["people", isCell ? "My people" : "Cells", isCell ? "people" : "cells"],
      ["help", "Help", "help"],
    ];
    return (
      <nav className="lx-tabs" aria-label="Main">
        {items.map(([k, label, icon]) => (
          <button
            key={k}
            aria-current={tab === k && ["home", "people", "cells", "help"].includes(screen.name) ? "page" : undefined}
            onClick={() => {
              setTab(k);
              go({ name: k === "week" ? "home" : k === "help" ? "help" : isCell ? "people" : "cells" });
            }}
          >
            <Icon n={icon} s={24} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    );
  };

  if (loading)
    return (
      <div className={"lx-app" + (dark ? " lx-dark" : "")}>
        <main className="lx-screen">
          <p className="lx-lead" role="status">Loading your week…</p>
        </main>
      </div>
    );
  if (!data)
    return (
      <div className={"lx-app" + (dark ? " lx-dark" : "")}>
        <main className="lx-screen">
          <h1 className="lx-title">THIS WEEK</h1>
          <p className="lx-alert" role="alert">{error || "Couldn't load your week."}</p>
          <button className="lx-btn lx-primary" onClick={() => { setLoading(true); void load(); }}>Try again</button>
        </main>
      </div>
    );

  /* ---------- Cell Leader: hub card ---------- */
  function Hub({ cell, compact = false }: { cell: Cell; compact?: boolean }) {
    const w = currentWeek(cell);
    const nextDate = addDays(lastMeetingDate(cell, today), 7);
    const nextWeek = weekView(data!, cell, nextDate);
    const when = `${longDate(w.date)}, ${timeRange(cell.meeting_start, cell.meeting_end)}`;
    const m = w.meeting;
    if (finished(m) && !compact) {
      return (
        <>
          <section className="lx-card lx-soft">
            <p className="lx-small" style={{ margin: 0 }}>
              <b>{longDate(w.date)}:</b>{" "}
              {m!.status === "no_meeting"
                ? "No meeting this week."
                : m!.status === "approved"
                  ? "Report approved. Thank you!"
                  : "Report sent. Waiting for approval."}
            </p>
          </section>
          {nextWeek.meeting?.status === "no_meeting" ? (
            <section className="lx-card">
              <h2>{longDate(nextDate)}</h2>
              <p className="lx-small lx-muted">Marked as <b>No meeting</b>.</p>
              <button
                className="lx-btn"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await post({ action: "undo_no_meeting", meeting_id: nextWeek.meeting!.id, version: nextWeek.meeting!.version });
                  })
                }
              >
                Undo: we will meet
              </button>
            </section>
          ) : (
            <section className="lx-card">
              <span className="lx-label">NEXT MEETING</span>
              <h2>{longDate(nextDate)}, {timeRange(cell.meeting_start, cell.meeting_end)}</h2>
              <p className="lx-small lx-muted">Come back after the meeting to record it.</p>
              <button className="lx-rowlink" onClick={() => go({ name: "noMeeting", cellId: cell.id, date: nextDate })}>
                <Icon n="cal" />
                <span>
                  <b>No meeting on {longDate(nextDate).split(",")[0]}?</b>
                  <small>Tell your Coordinator in one tap</small>
                </span>
                <Icon n="next" s={20} />
              </button>
            </section>
          )}
        </>
      );
    }
    const task = (icon: string, title: string, sub: string, status: string, cls: string, to: Screen) => (
      <button className={"lx-task " + cls} onClick={() => go(to)} disabled={!editable(m)}>
        <span className={"lx-tico " + cls}>
          <Icon n={icon} s={20} />
        </span>
        <span className="lx-tt">
          <b>{title}</b>
          <small>{sub}</small>
        </span>
        <span className={"lx-st " + cls}>{status}</span>
        <Icon n="next" s={18} />
      </button>
    );
    const att = w.attendance.length;
    return (
      <>
        {compact ? null : (
          <p className="lx-lead">
            Your cell meets <b>{when}</b>.
          </p>
        )}
        {w.correction && (
          <p className="lx-notice lx-warn">
            <Icon n="ret" s={20} />
            <span>
              <b>Sent back by your reviewer:</b> “{w.correction}”
            </span>
          </p>
        )}
        {!compact && <p className="lx-small lx-muted" style={{ margin: "-4px 0 0" }}>Tap any item, in any order.</p>}
        <section className="lx-card lx-tasks" aria-label={`${cell.name} this week`}>
          {task("people", "Attendance", att ? `${came(w.attendance)} came · ${absent(w.attendance)} absent` : "Who came?", att ? "Done" : "Not started", att ? "ok" : "", { name: "attendance", cellId: cell.id })}
          {task("plus", "Visitors", w.visits.length ? w.visits.map(visitName).join(", ") : "Did anyone new come?", w.visits.length ? `${w.visits.length} added` : "None", w.visits.length ? "ok" : "opt", { name: "visitors", cellId: cell.id })}
          {(["offering", "dues", "expense"] as Kind[]).map((k) =>
            task(
              k === "offering" ? "money" : k === "dues" ? "card" : "out",
              KIND_LABEL[k],
              w.money[k].length ? naira(total(w.money[k])) : k === "offering" ? "Money collected" : k === "dues" ? "Money paid as dues" : "Money spent, if any",
              w.money[k].length ? "Done" : "None",
              w.money[k].length ? "ok" : "opt",
              { name: "money", cellId: cell.id, kind: k },
            ),
          )}
        </section>
        <button className="lx-btn lx-primary" disabled={!att || !editable(m)} onClick={() => go({ name: "send", cellId: cell.id })}>
          <Icon n="send" s={20} /> Check and send
        </button>
        <p className="lx-small lx-muted lx-center" style={{ margin: "-6px 0 0" }}>
          {att ? "Anything left empty is sent as “none”." : "Take attendance first, then you can send."}
        </p>
        {!m || (m.status === "draft" && !att && !w.visits.length && !Object.values(w.money).some((x) => x.length)) ? (
          <button className="lx-rowlink" onClick={() => go({ name: "noMeeting", cellId: cell.id, date: w.date })}>
            <Icon n="cal" />
            <span>
              <b>No meeting on {longDate(w.date).split(",")[0]}?</b>
              <small>Tell your Coordinator in one tap</small>
            </span>
            <Icon n="next" s={20} />
          </button>
        ) : null}
      </>
    );
  }

  function CheckOn({ cells }: { cells: Cell[] }) {
    const list = cells.flatMap((c) => {
      const r = missedTwo(data!, c.id);
      return r.people.map((p) => ({ ...p, cell: c, ready: r.ready }));
    });
    const anyReady = cells.some((c) => missedTwo(data!, c.id).ready);
    return (
      <section className="lx-card lx-soft">
        <h2>Check on these people</h2>
        {!anyReady ? (
          <p className="lx-small lx-muted" style={{ margin: 0 }}>This list appears after attendance has been taken at two meetings.</p>
        ) : !list.length ? (
          <p className="lx-small lx-muted" style={{ margin: 0 }}>Everyone came to at least one of the last two meetings. 🙌</p>
        ) : (
          <>
            <p className="lx-small lx-muted">They missed the last 2 meetings.</p>
            {list.map(({ m, last, cell }) => (
              <PersonRow key={m.id + cell.id} m={m} sub={(cells.length > 1 ? cell.name + " · " : "") + (last ? `Last came ${shortDate(last)}` : "Not seen recently")} warn />
            ))}
          </>
        )}
      </section>
    );
  }
  function PersonRow({ m, sub, warn = false }: { m: Membership; sub: string; warn?: boolean }) {
    const name = personName(m);
    const phone = m.care_members?.phone || "";
    return (
      <div className="lx-person">
        <span className="lx-av">{initials(name)}</span>
        <span className="lx-pt">
          <b>{name}</b>
          <small className={warn ? "lx-warn-text" : ""}>{sub}</small>
        </span>
        {phone && (
          <>
            <a className="lx-sq" href={"tel:" + phone} aria-label={"Call " + name}>
              <Icon n="phone" />
            </a>
            <a className="lx-sq lx-wa" href={waLink(phone)} target="_blank" rel="noopener noreferrer" aria-label={"WhatsApp " + name}>
              <Icon n="wa" />
            </a>
          </>
        )}
      </div>
    );
  }

  /* ---------- Area pieces ---------- */
  function AreaList() {
    const rows = areaCells.map((c) => ({ c, w: currentWeek(c) }));
    const s = rows.map((r) => areaStatus(data!, r.w));
    const count = (k: string) => s.filter((x) => x.key === k).length;
    return (
      <>
        <p className="lx-count">
          <b>{reviewQueue.length}</b> waiting for you · <b>{count("ok")}</b> approved · <b>{s.filter((x) => x.label === "No meeting").length}</b> no meeting ·{" "}
          <b>{count("warn")}</b> not sent
        </p>
        <button className="lx-btn lx-primary" disabled={!reviewQueue.length} onClick={() => go({ name: "review", meetingId: reviewQueue[0].id })}>
          <Icon n="check" s={20} /> {reviewQueue.length ? `Review ${reviewQueue.length} report${reviewQueue.length === 1 ? "" : "s"}` : "Nothing to review"}
        </button>
        <section className="lx-card lx-tasks" aria-label="Cells this week">
          {rows.map(({ c, w }, i) => {
            const st = s[i];
            const leader = leaderOf(c.id);
            const own = myCells.some((x) => x.id === c.id);
            const sub = (own ? "Your cell" : leader?.name || "") + (w.meeting && w.attendance.length ? ` · ${came(w.attendance)} came` : "");
            const phone = leader?.phone || "";
            const open = st.key === "wait" && w.meeting ? () => go({ name: "review", meetingId: w.meeting!.id }) : undefined;
            return (
              <div className="lx-task lx-cell" key={c.id} onClick={open} role={open ? "button" : undefined} tabIndex={open ? 0 : undefined}>
                <span className="lx-pt">
                  <b>{c.name}</b>
                  <small>{sub || " "}</small>
                </span>
                <span className={"lx-chip " + st.key}>{own && st.label === "Waiting for approval" ? "With Coordinator" : st.label}</span>
                {st.key === "warn" && phone && !own ? (
                  <a className="lx-sq" href={"tel:" + phone} aria-label={"Call " + (leader?.name || "leader")} onClick={(e) => e.stopPropagation()}>
                    <Icon n="phone" />
                  </a>
                ) : open ? (
                  <Icon n="next" s={18} />
                ) : null}
              </div>
            );
          })}
        </section>
        <button className="lx-rowlink" onClick={() => go({ name: "checkOn" })}>
          <Icon n="people" />
          <span>
            <b>People to check on</b>
            <small>Members who missed the last 2 meetings</small>
          </span>
          <Icon n="next" s={20} />
        </button>
      </>
    );
  }
  function summary(w: WeekView) {
    return (
      <div className="lx-card lx-list">
        <div className="lx-line"><span>Came</span><b>{came(w.attendance)} people</b></div>
        <div className="lx-line"><span>Absent</span><b>{absent(w.attendance)} people</b></div>
        <div className="lx-line"><span>Visitors</span><b>{w.visits.length ? `${w.visits.length} · ${w.visits.map(visitName).join(", ")}` : <span className="lx-muted">None</span>}</b></div>
        {(["offering", "dues", "expense"] as Kind[]).map((k) => (
          <div className="lx-line" key={k}>
            <span>{KIND_LABEL[k]}</span>
            <b>{w.money[k].length ? naira(total(w.money[k])) : <span className="lx-muted">None</span>}</b>
          </div>
        ))}
      </div>
    );
  }

  const ctx: Ctx = { data, busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary };

  /* ---------- screens ---------- */
  let body: React.ReactNode;
  let showTabs = true;
  const s = screen;

  if (s.name === "home") {
    const subtitle = isCell && isArea ? "Area Leader + Cell Leader" : isArea ? `${areaName(myAreas[0])} · Area Leader` : `${myCells[0]?.name || "Your cell"} · Cell Leader`;
    body = (
      <>
        <Header sub={subtitle} />
        <h1 className="lx-title">THIS WEEK</h1>
        <Alert />
        {isCell && !isArea && myCells.length === 1 && (
          <>
            <Hub cell={myCells[0]} />
            <CheckOn cells={myCells} />
          </>
        )}
        {isCell && (isArea || myCells.length > 1) &&
          myCells.map((c) => {
            const w = currentWeek(c);
            return (
              <section className="lx-card lx-dual" key={c.id}>
                <span className="lx-label">YOUR CELL · {c.name.toUpperCase()}</span>
                <p className="lx-small" style={{ margin: "2px 0 8px" }}>
                  {longDate(w.date)}, {timeRange(c.meeting_start, c.meeting_end)} ·{" "}
                  {w.meeting?.status === "submitted" ? "Sent" : w.meeting?.status === "approved" ? "Approved" : w.meeting?.status === "no_meeting" ? "No meeting" : w.attendance.length ? "In progress" : "Not started"}
                </p>
                <button className="lx-btn" onClick={() => go({ name: "hub", cellId: c.id })}>
                  Open my cell&rsquo;s week <Icon n="next" s={18} />
                </button>
              </section>
            );
          })}
        {isArea && (
          <section className={isCell ? "lx-card lx-dual" : "lx-plain"}>
            {isCell && <span className="lx-label">YOUR AREA · {areaName(myAreas[0]).toUpperCase()} · {areaCells.length} CELLS</span>}
            <AreaList />
          </section>
        )}
        {isCell && isArea && (
          <p className="lx-notice">
            <Icon n="info" s={20} />
            <span>
              Your own cell&rsquo;s report goes to{" "}
              <b>{holders(data, "area_leader", (r) => r.area_id === myCells[0]?.area_id && r.user_id !== userId)[0]?.name || coordinators(myCells[0]?.area_id)[0]?.name || "your Coordinator"}</b>{" "}
              for approval, not to you.
            </span>
          </p>
        )}
        <HelpBar />
      </>
    );
  } else if (s.name === "hub") {
    const cell = cellById(s.cellId);
    body = (
      <>
        <Header sub={`${cell.name} · Cell Leader`} back="This week" />
        <h1 className="lx-title">MY CELL</h1>
        <Alert />
        <Hub cell={cell} />
        <CheckOn cells={[cell]} />
      </>
    );
  } else if (s.name === "attendance") {
    body = <AttendanceScreen key={s.cellId} cell={cellById(s.cellId)} ctx={ctx} />;
    showTabs = false;
  } else if (s.name === "visitors") {
    const cell = cellById(s.cellId),
      w = currentWeek(cell);
    showTabs = false;
    body = (
      <>
        <Header sub={longDate(w.date)} back="This week" onBack={() => back(cell)} />
        <h1 className="lx-title">ANY VISITORS?</h1>
        <Alert />
        <p className="lx-lead">Did anyone new come to the meeting?</p>
        <button className="lx-choice" onClick={() => go({ name: "visitorForm", cellId: cell.id })}>
          <span className="lx-ci"><Icon n="plus" s={24} /></span>
          <span><b>Yes, add a visitor</b><small>Name and phone number</small></span>
        </button>
        <button className="lx-choice" onClick={() => back(cell)}>
          <span className="lx-ci lx-ci-muted">✕</span>
          <span><b>No visitors this time</b><small>Back to this week</small></span>
        </button>
        <div className="lx-card lx-soft">
          <p className="lx-small" style={{ margin: 0 }}>
            Added so far: <b>{w.visits.length ? w.visits.map(visitName).join(", ") : "none"}</b>
          </p>
        </div>
        <HelpBar />
      </>
    );
  } else if (s.name === "visitorForm") {
    body = <VisitorForm key="vf" cell={cellById(s.cellId)} ctx={ctx} />;
    showTabs = false;
  } else if (s.name === "money") {
    body = <MoneyScreen key={s.cellId + s.kind} cell={cellById(s.cellId)} kind={s.kind} ctx={ctx} />;
    showTabs = false;
  } else if (s.name === "send") {
    body = <SendScreen key={s.cellId} cell={cellById(s.cellId)} ctx={ctx} />;
    showTabs = false;
  } else if (s.name === "noMeeting") {
    const cell = cellById(s.cellId);
    showTabs = false;
    body = (
      <>
        <Header sub={`${longDate(s.date)} · ${timeRange(cell.meeting_start, cell.meeting_end)}`} back="This week" onBack={() => back(cell)} />
        <h1 className="lx-title">NO MEETING?</h1>
        <Alert />
        <p className="lx-lead">Your cell won&rsquo;t meet on {longDate(s.date)}?</p>
        <p className="lx-small lx-muted" style={{ margin: 0 }}>
          Tap the button below. Your Coordinator will see <b>No meeting</b> for this week.
        </p>
        <div className="lx-card lx-soft">
          <p className="lx-small" style={{ margin: 0 }}>
            This week will show <b>No meeting</b>, not “missing”. You can undo it later if plans change.
          </p>
        </div>
        <div className="lx-stick">
          <button
            className="lx-btn lx-primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await post({ action: "no_meeting", cell_id: cell.id, meeting_date: s.date });
                go({ name: "sent", cellId: cell.id, noMeeting: true });
              })
            }
          >
            <Icon n="send" s={20} /> Tell my Coordinator
          </button>
        </div>
      </>
    );
  } else if (s.name === "sent") {
    const cell = cellById(s.cellId);
    const next = addDays(lastMeetingDate(cell, today), 7);
    body = (
      <div className="lx-center-col">
        <div className="lx-bigtick"><Icon n="check" s={54} /></div>
        <h1 className="lx-title lx-center">{s.noMeeting ? "DONE. THANK YOU!" : "SENT. THANK YOU!"}</h1>
        <p className="lx-lead lx-center">
          {s.noMeeting ? "Your Coordinator will see No meeting for that week." : "Your report has been sent for approval."}
          <br />
          Nothing more to do until the next meeting.
        </p>
        <div className="lx-card lx-soft">
          <p className="lx-small" style={{ margin: 0 }}>
            <b>Next meeting:</b> {longDate(next)}, {timeRange(cell.meeting_start, cell.meeting_end)}
          </p>
        </div>
        <button className="lx-btn" onClick={() => go({ name: "home" })}>Back to This week</button>
      </div>
    );
  } else if (s.name === "people") {
    const list = data.memberships.filter((ms) => myCells.some((c) => c.id === ms.cell_id));
    body = (
      <>
        <Header sub={`${myCells.map((c) => c.name).join(", ")} · ${list.length} people`} />
        <h1 className="lx-title">MY PEOPLE</h1>
        <PeopleList list={list} ctx={ctx} />
        <a className="lx-btn" href="/home-cell/members">
          <Icon n="plus" s={20} /> Add someone to my cell
        </a>
        {isArea && (
          <button className="lx-rowlink" onClick={() => go({ name: "cells" })}>
            <Icon n="cells" />
            <span><b>All cells in my area</b><small>{areaCells.length} cells</small></span>
            <Icon n="next" s={20} />
          </button>
        )}
      </>
    );
  } else if (s.name === "cells") {
    const month = today.slice(0, 7);
    const monthMeetings = data.meetings.filter((m) => areaCells.some((c) => c.id === m.cell_id) && m.meeting_date.startsWith(month));
    const monthAtt = data.attendance.filter((a) => monthMeetings.some((m) => m.id === a.meeting_id));
    const monthOffering = total(data.finances.filter((f) => !f.voided_at && f.kind === "offering" && monthMeetings.some((m) => m.id === f.meeting_id)));
    body = (
      <>
        <Header sub={`${areaName(myAreas[0])} · ${areaCells.length} cells`} back={isCell ? "My people" : undefined} onBack={() => go({ name: "people" })} />
        <h1 className="lx-title">CELLS</h1>
        <div className="lx-card lx-list">
          {areaCells.map((c) => {
            const leader = leaderOf(c.id);
            const L = lastMeetingDate(c, today);
            const last4 = [0, 7, 14, 21].map((d) => {
              const w = weekView(data, c, addDays(L, -d));
              return w.meeting?.status === "no_meeting" ? "No meeting" : w.attendance.length ? String(came(w.attendance)) : "—";
            });
            return (
              <div className="lx-person" key={c.id}>
                <span className="lx-av">{initials(c.name)}</span>
                <span className="lx-pt">
                  <b>{c.name}</b>
                  <small>{leader?.name || "Leader not set"} · {longDate(L).split(",")[0]}s {timeRange(c.meeting_start, c.meeting_end)}</small>
                  <small className="lx-att4">Last 4 meetings: {last4.join(" · ")}</small>
                </span>
                {leader?.phone && (
                  <a className="lx-sq" href={"tel:" + leader.phone} aria-label={"Call " + leader.name}><Icon n="phone" /></a>
                )}
              </div>
            );
          })}
        </div>
        <div className="lx-card lx-soft">
          <p className="lx-small" style={{ margin: 0 }}>
            <b>This month in your area:</b>{" "}
            {monthAtt.length ? `${Math.round((came(monthAtt) / monthAtt.length) * 100)}% attendance` : "no attendance yet"} · {naira(monthOffering)} offering
          </p>
        </div>
      </>
    );
  } else if (s.name === "checkOn") {
    body = (
      <>
        <Header sub={areaName(myAreas[0])} back="This week" />
        <h1 className="lx-title">CHECK ON</h1>
        <CheckOn cells={areaCells} />
      </>
    );
  } else if (s.name === "review") {
    body = <ReviewScreen key={s.meetingId} meetingId={s.meetingId} ctx={ctx} />;
    showTabs = false;
  } else if (s.name === "sendBack") {
    body = <SendBackScreen key={s.meetingId} meetingId={s.meetingId} ctx={ctx} />;
    showTabs = false;
  } else if (s.name === "approved") {
    const m = data.meetings.find((x) => x.id === s.meetingId);
    const next = reviewQueue.find((x) => x.id !== s.meetingId);
    body = (
      <div className="lx-center-col">
        <div className="lx-bigtick"><Icon n="check" s={54} /></div>
        <h1 className="lx-title lx-center">APPROVED</h1>
        <p className="lx-lead lx-center">
          {m ? `${cellById(m.cell_id)?.name}'s report for ${longDate(m.meeting_date)} is approved.` : "The report is approved."}
        </p>
        {next ? (
          <>
            <div className="lx-card lx-soft">
              <p className="lx-small" style={{ margin: 0 }}>
                <b>{reviewQueue.length} more</b> waiting: {cellById(next.cell_id)?.name}
              </p>
            </div>
            <button className="lx-btn lx-primary" onClick={() => go({ name: "review", meetingId: next.id })}>
              Review next <Icon n="next" s={20} />
            </button>
          </>
        ) : null}
        <button className="lx-btn" onClick={() => go({ name: "home" })}>Back to This week</button>
      </div>
    );
  } else {
    // help
    const helpers = coordinators();
    body = (
      <>
        <Header sub={isCell && isArea ? "Area + Cell Leader" : isArea ? "Area Leader" : "Cell Leader"} />
        <h1 className="lx-title">HELP</h1>
        <section className="lx-card">
          <h2>Your Coordinator</h2>
          {helpers.length ? (
            helpers.slice(0, 2).map((c) => (
              <div key={c.user_id} className="lx-help-person">
                <div className="lx-person lx-flat">
                  <span className="lx-av">{initials(c.name || "C")}</span>
                  <span className="lx-pt"><b>{c.name || "Coordinator"}</b><small>{areaName(c.area_id || "")}</small></span>
                </div>
                {c.phone ? (
                  <div className="lx-two">
                    <a className="lx-btn lx-primary" href={"tel:" + c.phone}><Icon n="phone" s={20} /> Call</a>
                    <a className="lx-btn lx-wabtn" href={waLink(c.phone)} target="_blank" rel="noopener noreferrer"><Icon n="wa" s={20} /> WhatsApp</a>
                  </div>
                ) : (
                  <p className="lx-small lx-muted">No phone number saved. Ask the church office.</p>
                )}
              </div>
            ))
          ) : (
            <p className="lx-small lx-muted">Your Coordinator&rsquo;s details aren&rsquo;t saved yet. Ask the church office.</p>
          )}
        </section>
        <section className="lx-card">
          <h2>How do I…</h2>
          <details className="lx-more"><summary>Record this week&rsquo;s meeting?</summary><p className="lx-small">Open <b>This week</b> and tap any item. Each one saves on its own. When attendance is done, tap <b>Check and send</b>.</p></details>
          <details className="lx-more"><summary>Say we didn&rsquo;t meet?</summary><p className="lx-small">On <b>This week</b>, tap <b>No meeting?</b> and then <b>Tell my Coordinator</b>.</p></details>
          <details className="lx-more"><summary>Fix a mistake I already sent?</summary><p className="lx-small">Ask your reviewer to send the report back. Then change it and send again.</p></details>
          {isArea && <details className="lx-more"><summary>Approve a cell&rsquo;s report?</summary><p className="lx-small">On <b>This week</b>, tap <b>Review</b>. Check the numbers, then tap <b>Approve</b> or <b>Send back</b>.</p></details>}
        </section>
        <a className="lx-btn" href="/home-cell?full=1">Open the full Home Cell Office</a>
        <button
          className="lx-btn"
          onClick={async () => {
            const r = await fetch("/api/auth/logout", { method: "POST" });
            if (r.ok) location.assign("/home-cell/login");
            else setError("Sign-out failed. Please retry.");
          }}
        >
          Sign out
        </button>
        <Alert />
      </>
    );
  }

  function back(cell: Cell) {
    go(isCell && (isArea || myCells.length > 1) ? { name: "hub", cellId: cell.id } : { name: "home" });
  }

  /* ---------- sub-screens with their own state ---------- */
  return (
    <div className={"lx-app" + (dark ? " lx-dark" : "")}>
      <main className="lx-screen">
        {body}
        {!showTabs && s.name !== "visitors" && <HelpBar />}
      </main>
      {showTabs && <Tabs />}
    </div>
  );
}

/* ---------- screens with their own state live outside LeaderApp so typing is never lost ---------- */
type Ctx = {
  data: WorkspaceData;
  busy: boolean;
  go: (s: Screen) => void;
  back: (c: Cell) => void;
  run: (fn: () => Promise<void>) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post: (b: Record<string, unknown>) => Promise<any>;
  ensureMeeting: (w: WeekView) => Promise<{ id: string; version: number; notes: string | null }>;
  currentWeek: (c: Cell) => WeekView;
  cellById: (id: string) => Cell;
  reviewQueue: Meeting[];
  leaderOf: (id: string) => RoleHolder | undefined;
  Header: (p: { sub: string; back?: string; onBack?: () => void }) => React.JSX.Element;
  Alert: () => React.JSX.Element | null;
  PersonRow: (p: { m: Membership; sub: string; warn?: boolean }) => React.JSX.Element;
  summary: (w: WeekView) => React.ReactNode;
};

function PeopleList({ list, ctx }: { list: Membership[]; ctx: Ctx }) {
  const { data, busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary } = ctx;
  void [busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary];
  const [q, setQ] = useState("");
  const shown = list
    .filter((m) => personName(m).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => personName(a).localeCompare(personName(b)));
  return (
    <>
      <label className="lx-search">
        <span className="lx-sr">Find a name</span>
        <input placeholder="Find a name" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="lx-card lx-list">
        {shown.map((m) => {
          const last = lastCame(data!, m.member_id, m.cell_id);
          const missed = missedTwo(data!, m.cell_id).people.some((p) => p.m.id === m.id);
          return (
            <PersonRow key={m.id} m={m} sub={missed ? `Missed 2 · ${last ? "last came " + shortDate(last) : "not seen recently"}` : last ? `Came ${shortDate(last)}` : "No attendance yet"} warn={missed} />
          );
        })}
        {!shown.length && <p className="lx-small lx-muted lx-pad">No one found.</p>}
      </div>
    </>
  );
}


function AttendanceScreen({ cell, ctx }: { cell: Cell; ctx: Ctx }) {
  const { data, busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary } = ctx;
  void [busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary];
  const w = currentWeek(cell);
  const people = useMemo(
    () => [
      ...data!.memberships.filter((m) => m.cell_id === cell.id).map((m) => ({ key: "m:" + m.member_id, id: m.member_id, kind: "member" as const, name: personName(m) })),
      ...w.visits.map((v) => ({ key: "v:" + v.id, id: v.id, kind: "visit" as const, name: visitName(v) + " (visitor)" })),
    ].sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cell.id],
  );
  const initial: Record<string, string> = {};
  for (const a of w.attendance) {
    if (a.member_id) initial["m:" + a.member_id] = a.status;
    else if (a.visitor_name?.startsWith("visit:")) initial["v:" + a.visitor_name.slice(6)] = a.status;
  }
  const [marks, setMarks] = useState<Record<string, string>>(initial);
  const n = (st: string) => people.filter((p) => marks[p.key] === st).length;
  const unmarked = people.filter((p) => !marks[p.key]).length;
  return (
    <>
      <Header sub={longDate(w.date)} back="This week" onBack={() => back(cell)} />
      <h1 className="lx-title">WHO CAME?</h1>
      <Alert />
      {!people.length ? (
        <p className="lx-notice">No members are in this cell yet. Add people from <b>My people</b> first.</p>
      ) : (
        <>
          <button className="lx-btn" onClick={() => setMarks(Object.fromEntries(people.map((p) => [p.key, "present"])))}>
            <Icon n="check" s={20} /> Everyone came
          </button>
          <p className="lx-count">
            <b>{n("present")}</b> came · <b>{n("late")}</b> late · <b>{n("absent")}</b> absent{unmarked ? <> · <b>{unmarked}</b> not marked</> : null}
          </p>
          <div className="lx-card lx-list">
            {people.map((p) => (
              <div className="lx-att" key={p.key}>
                <span className="lx-av">{initials(p.name)}</span>
                <b className="lx-an">{p.name}</b>
                <div className="lx-seg" role="radiogroup" aria-label={p.name}>
                  {[["present", "Came", "c"], ["late", "Late", "l"], ["absent", "Absent", "a"]].map(([v, label, cls]) => (
                    <button key={v} role="radio" aria-checked={marks[p.key] === v} className={marks[p.key] === v ? "on " + cls : ""} onClick={() => setMarks((x) => ({ ...x, [p.key]: v }))}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="lx-stick">
        <button
          className="lx-btn lx-primary"
          disabled={busy || !people.length || unmarked > 0}
          onClick={() =>
            run(async () => {
              const m = await ensureMeeting(w);
              await post({
                action: "attendance",
                meeting_id: m.id,
                version: m.version,
                notes: m.notes || "",
                rows: people.map((p) => (p.kind === "member" ? { member_id: p.id, status: marks[p.key] } : { visit_id: p.id, status: marks[p.key] })),
              });
              back(cell);
            })
          }
        >
          {unmarked ? `Mark everyone (${unmarked} left)` : "Save"}
        </button>
      </div>
    </>
  );
}


function VisitorForm({ cell, ctx }: { cell: Cell; ctx: Ctx }) {
  const { data, busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary } = ctx;
  void [busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary];
  const w = currentWeek(cell);
  const req = useRef("");
  const [f, setF] = useState({ other_names: "", surname: "", phone: "", email: "", whatsapp: "", invited_by: "", notes: "" });
  const [consent, setConsent] = useState<boolean | null>(null);
  const [matches, setMatches] = useState<{ members: Person[]; guests: Person[] } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function lookup() {
    const q = f.phone.replace(/\s/g, "");
    if (q.replace(/\D/g, "").length < 10) return;
    try {
      const r = await fetch("/api/home-cell/people?q=" + encodeURIComponent(q), { cache: "no-store" });
      const x = await r.json();
      if (r.ok && (x.members?.length || x.guests?.length)) setMatches(x);
      else setMatches(null);
    } catch {
      /* the server check still prevents duplicates */
    }
  }
  async function add(existing?: { kind: "member" | "guest"; id: string }) {
    await run(async () => {
      const m = await ensureMeeting(w);
      if (!req.current) req.current = crypto.randomUUID();
      try {
        await post({
          action: "visitor",
          request_id: req.current,
          meeting_id: m.id,
          cell_id: cell.id,
          ...(existing
            ? { [existing.kind === "member" ? "member_id" : "guest_submission_id"]: existing.id }
            : { ...f, contact_consent: consent === true, email_opt_in: false, sms_opt_in: false }),
        });
      } catch (e) {
        if (e instanceof Error && e.message.includes("already in church records")) await lookup();
        throw e;
      }
      req.current = "";
      go({ name: "visitors", cellId: cell.id });
    });
  }
  const ready = f.other_names.trim() && f.surname.trim() && f.phone.replace(/\D/g, "").length >= 10 && consent !== null;
  return (
    <>
      <Header sub={`Visitors · ${longDate(w.date)}`} back="Back" onBack={() => go({ name: "visitors", cellId: cell.id })} />
      <h1 className="lx-title">ADD A VISITOR</h1>
      <Alert />
      <label className="lx-field"><span>First name</span><input value={f.other_names} onChange={set("other_names")} maxLength={120} autoComplete="given-name" /></label>
      <label className="lx-field"><span>Surname</span><input value={f.surname} onChange={set("surname")} maxLength={120} autoComplete="family-name" /></label>
      <label className="lx-field"><span>Phone number</span><input value={f.phone} onChange={set("phone")} onBlur={lookup} inputMode="tel" autoComplete="tel" placeholder="0801 234 5678" /></label>
      {matches && (
        <div className="lx-notice">
          <Icon n="people" s={20} />
          <span>
            <b>Already in our records:</b>
            {[...matches.members.map((p) => ({ p, kind: "member" as const })), ...matches.guests.map((p) => ({ p, kind: "guest" as const }))].slice(0, 3).map(({ p, kind }) => (
              <span key={p.id} className="lx-match">
                {p.other_names} {p.surname}{" "}
                <button className="lx-link" disabled={busy} onClick={() => add({ kind, id: p.id })}>Use this person</button>
              </span>
            ))}
          </span>
        </div>
      )}
      <div className="lx-field">
        <span>Can the church call or WhatsApp them?</span>
        <div className="lx-yn" role="radiogroup" aria-label="Contact permission">
          <button role="radio" aria-checked={consent === true} className={consent === true ? "on" : ""} onClick={() => setConsent(true)}>Yes</button>
          <button role="radio" aria-checked={consent === false} className={consent === false ? "on no" : ""} onClick={() => setConsent(false)}>No</button>
        </div>
      </div>
      <details className="lx-more">
        <summary>More details (optional)</summary>
        <label className="lx-field"><span>Email</span><input value={f.email} onChange={set("email")} inputMode="email" /></label>
        <label className="lx-field"><span>WhatsApp number</span><input value={f.whatsapp} onChange={set("whatsapp")} inputMode="tel" /></label>
        <label className="lx-field"><span>Who invited them?</span><input value={f.invited_by} onChange={set("invited_by")} maxLength={400} /></label>
        <label className="lx-field"><span>Notes</span><textarea value={f.notes} onChange={set("notes")} maxLength={2000} rows={2} /></label>
      </details>
      <div className="lx-stick">
        <button className="lx-btn lx-primary" disabled={busy || !ready} onClick={() => add()}>
          {ready ? "Add visitor" : "Fill name, phone and the Yes/No question"}
        </button>
      </div>
    </>
  );
}


function MoneyScreen({ cell, kind, ctx }: { cell: Cell; kind: Kind; ctx: Ctx }) {
  const { data, busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary } = ctx;
  void [busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary];
  const w = currentWeek(cell);
  const rows = w.money[kind];
  const [amount, setAmount] = useState("");
  const [what, setWhat] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const value = Number(amount.replace(/[^\d.]/g, ""));
  const question = kind === "offering" ? "How much offering was collected?" : kind === "dues" ? "How much was paid in dues?" : "How much was spent?";
  const describe = kind === "offering" ? "Offering" : kind === "dues" ? (what.trim() ? `Dues: ${what.trim()}` : "Dues") : what.trim();
  const ok = value > 0 && (kind !== "expense" || what.trim().length >= 3);
  return (
    <>
      <Header sub={longDate(w.date)} back="This week" onBack={() => back(cell)} />
      <h1 className="lx-title">{KIND_LABEL[kind].toUpperCase()}</h1>
      <Alert />
      {rows.length > 0 && (
        <div className="lx-card lx-list">
          {rows.map((r) => (
            <div key={r.id}>
              <div className="lx-line">
                <span>{r.description || KIND_LABEL[kind]}</span>
                <b>{naira(Number(r.amount))}</b>
                <button className="lx-link" onClick={() => { setRemoving(r.id); setWhy(""); }}>Remove</button>
              </div>
              {removing === r.id && (
                <div className="lx-remove">
                  <label className="lx-field"><span>Why remove it?</span><input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Typed the wrong amount" /></label>
                  <div className="lx-two">
                    <button className="lx-btn" onClick={() => setRemoving(null)}>Keep it</button>
                    <button
                      className="lx-btn lx-danger"
                      disabled={busy || why.trim().length < 5}
                      onClick={() =>
                        run(async () => {
                          await post({ action: "void_finance", meeting_id: w.meeting!.id, version: w.meeting!.version, finance_id: r.id, reason: why.trim() });
                          setRemoving(null);
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="lx-line lx-total"><span>Total</span><b>{naira(total(rows))}</b></div>
        </div>
      )}
      <label className="lx-field">
        <span>{rows.length ? "Add more?" : question}</span>
        <div className="lx-money">
          <span>₦</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" aria-label="Amount in naira" />
        </div>
      </label>
      {kind !== "offering" && (
        <label className="lx-field">
          <span>{kind === "dues" ? <>Who paid? <i>(optional)</i></> : "What was it for?"}</span>
          <input value={what} onChange={(e) => setWhat(e.target.value)} maxLength={300} placeholder={kind === "dues" ? "e.g. Kemi, John" : "e.g. Refreshments"} />
        </label>
      )}
      {!rows.length && (
        <button className="lx-btn" onClick={() => back(cell)}>No {KIND_LABEL[kind].toLowerCase()} this week</button>
      )}
      <div className="lx-stick">
        <button
          className="lx-btn lx-primary"
          disabled={busy || !ok}
          onClick={() =>
            run(async () => {
              const m = await ensureMeeting(w);
              await post({ action: "finance", meeting_id: m.id, version: m.version, kind, amount: Math.round(value * 100) / 100, description: describe });
              back(cell);
            })
          }
        >
          Save
        </button>
      </div>
    </>
  );
}


function SendScreen({ cell, ctx }: { cell: Cell; ctx: Ctx }) {
  const { data, busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary } = ctx;
  void [busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary];
  const w = currentWeek(cell);
  const [note, setNote] = useState(w.meeting?.notes || "");
  return (
    <>
      <Header sub={longDate(w.date)} back="This week" onBack={() => back(cell)} />
      <h1 className="lx-title">CHECK AND SEND</h1>
      <Alert />
      {w.correction && (
        <p className="lx-notice lx-warn"><Icon n="ret" s={20} /><span><b>Sent back:</b> “{w.correction}”</span></p>
      )}
      {summary(w)}
      <label className="lx-field">
        <span>Anything to tell your reviewer? <i>(optional)</i></span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </label>
      <div className="lx-stick">
        <button
          className="lx-btn lx-primary"
          disabled={busy || !w.attendance.length}
          onClick={() =>
            run(async () => {
              let m = w.meeting!;
              if ((m.notes || "") !== note) {
                m = await post({
                  action: "attendance",
                  meeting_id: m.id,
                  version: m.version,
                  notes: note,
                  rows: w.attendance.map((a) => (a.member_id ? { member_id: a.member_id, status: a.status } : { visit_id: a.visitor_name!.slice(6), status: a.status })),
                });
              }
              await post({ action: "submit", meeting_id: m.id, version: m.version });
              go({ name: "sent", cellId: cell.id });
            })
          }
        >
          <Icon n="send" s={20} /> Send for approval
        </button>
      </div>
    </>
  );
}


function ReviewScreen({ meetingId, ctx }: { meetingId: string; ctx: Ctx }) {
  const { data, busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary } = ctx;
  void [busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary];
  const m = data!.meetings.find((x) => x.id === meetingId);
  if (!m) return <p className="lx-lead">This report is no longer waiting.</p>;
  const cell = cellById(m.cell_id);
  const w = weekView(data!, cell, m.meeting_date);
  const pos = reviewQueue.findIndex((x) => x.id === m.id) + 1;
  const leader = leaderOf(cell.id);
  const canApprove = data!.approvable?.includes(m.id);
  return (
    <>
      <Header sub={`Report ${pos || 1} of ${reviewQueue.length || 1} · ${longDate(m.meeting_date)}`} back="This week" />
      <h1 className="lx-title">{cell.name.toUpperCase()}</h1>
      <Alert />
      <p className="lx-lead">Sent by <b>{leader?.name || "the cell leader"}</b>{m.submitted_at ? ` · ${new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(m.submitted_at))}` : ""}</p>
      {summary(w)}
      {m.notes && <div className="lx-card lx-soft"><p className="lx-small" style={{ margin: 0 }}><b>Leader&rsquo;s note:</b> {m.notes}</p></div>}
      {!canApprove && <p className="lx-notice"><Icon n="info" s={20} /><span>You can send this back, but approval is for the Area Leader.</span></p>}
      <div className="lx-stick">
        <div className="lx-two">
          <button className="lx-btn" disabled={busy} onClick={() => go({ name: "sendBack", meetingId: m.id })}><Icon n="ret" s={20} /> Send back</button>
          <button
            className="lx-btn lx-primary"
            disabled={busy || !canApprove}
            onClick={() =>
              run(async () => {
                await post({ action: "approve", meeting_id: m.id, version: m.version });
                go({ name: "approved", meetingId: m.id });
              })
            }
          >
            <Icon n="check" s={20} /> Approve
          </button>
        </div>
      </div>
    </>
  );
}


function SendBackScreen({ meetingId, ctx }: { meetingId: string; ctx: Ctx }) {
  const { data, busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary } = ctx;
  void [busy, go, back, run, post, ensureMeeting, currentWeek, cellById, reviewQueue, leaderOf, Header, Alert, PersonRow, summary];
  const m = data!.meetings.find((x) => x.id === meetingId);
  const [reason, setReason] = useState("");
  if (!m) return <p className="lx-lead">This report is no longer waiting.</p>;
  const cell = cellById(m.cell_id);
  const leader = leaderOf(cell.id);
  const first = (leader?.name || "the leader").split(" ")[0];
  return (
    <>
      <Header sub={`${cell.name} · ${longDate(m.meeting_date)}`} back="Report" onBack={() => go({ name: "review", meetingId })} />
      <h1 className="lx-title">SEND BACK</h1>
      <Alert />
      <label className="lx-field">
        <span>What should {first} fix?</span>
        <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
        <small className="lx-hint">{first} will see this message at the top of the report.</small>
      </label>
      <div className="lx-stick">
        <button
          className="lx-btn lx-primary"
          disabled={busy || reason.trim().length < 5}
          onClick={() =>
            run(async () => {
              await post({ action: "correction", meeting_id: m.id, version: m.version, reason: reason.trim() });
              go({ name: "home" });
            })
          }
        >
          <Icon n="ret" s={20} /> Send back to {first}
        </button>
      </div>
    </>
  );
}


// keep unused-import lint quiet for helpers referenced only in some roles
void sameWeek;
