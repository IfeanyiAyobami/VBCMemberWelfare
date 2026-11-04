/*
 * Friend mode outbox — "keep it until it sends".
 *
 * Every Friend update is written to this phone's storage before it is sent.
 * It is removed only after the server confirms it. Retries are safe:
 *  - an attempt keeps its exact body and request ID, and the server returns
 *    the stored result if that request was already applied (lost replies);
 *  - if the server says the record changed (409) the original was NOT applied
 *    (a replay would have been recognised first), so the item is rebuilt with
 *    the current version and a new request ID.
 *
 * Storage is per signed-in staff member and holds only unsent updates plus
 * today's short "done" list. Both are cleared on sign-out.
 */

export type OutboxAction = "contact" | "attendance";

export type OutboxItem = {
  id: string;
  createdAt: string;
  memberId: string;
  name: string;
  action: OutboxAction;
  data: Record<string, unknown>;
  summary: string;
  attempt?: { requestId: string; body: string } | null;
  error?: string | null;
  tries: number;
};

export type DoneItem = {
  id: string;
  memberId: string;
  name: string;
  summary: string;
  at: string;
  sent: boolean;
};

const outboxKey = (user: string) => "vbc-friend-outbox:" + user;
const doneKey = (user: string) => "vbc-friend-done:" + user;

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function write(key: string, value: unknown[]) {
  try {
    if (value.length) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* storage full or blocked: the in-memory copy still retries this session */
  }
}

export function loadOutbox(user: string): OutboxItem[] {
  return read<OutboxItem>(outboxKey(user));
}
export function saveOutbox(user: string, items: OutboxItem[]) {
  write(outboxKey(user), items);
}

const lagosDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
    new Date(iso),
  );

export function loadDone(user: string): DoneItem[] {
  const today = lagosDay(new Date().toISOString());
  const items = read<DoneItem>(doneKey(user)).filter(
    (d) => lagosDay(d.at) === today,
  );
  return items;
}
export function recordDone(user: string, item: DoneItem) {
  const items = [item, ...loadDone(user).filter((d) => d.id !== item.id)].slice(
    0,
    40,
  );
  write(doneKey(user), items);
}
export function markDoneSent(user: string, id: string) {
  write(
    doneKey(user),
    loadDone(user).map((d) => (d.id === id ? { ...d, sent: true } : d)),
  );
}

export function clearFriendStorage(user: string) {
  try {
    localStorage.removeItem(outboxKey(user));
    localStorage.removeItem(doneKey(user));
  } catch {
    /* ignore */
  }
}

export function enqueue(
  user: string,
  item: Omit<OutboxItem, "id" | "createdAt" | "tries">,
): OutboxItem {
  const full: OutboxItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    tries: 0,
    attempt: null,
    error: null,
  };
  saveOutbox(user, [...loadOutbox(user), full]);
  return full;
}

type Result = "sent" | "retry" | "rejected";

async function currentVersion(memberId: string): Promise<number> {
  const params = new URLSearchParams({
    search: "",
    page: "0",
    view: "all",
    stage: "all",
    memberId,
  });
  const r = await fetch("/api/journey?" + params, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) {
    const x = await r.json().catch(() => ({}));
    const error = new Error(x.message || "Unable to reach Member Care.");
    (error as Error & { status?: number }).status = r.status;
    throw error;
  }
  const x = await r.json();
  const v = x.detail?.person?.version;
  if (typeof v !== "number") {
    const error = new Error("This person is no longer in your list.");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return v;
}

async function sendOne(
  user: string,
  item: OutboxItem,
  update: (i: OutboxItem) => void,
): Promise<Result> {
  for (let round = 0; round < 3; round++) {
    try {
      if (!item.attempt) {
        const version = await currentVersion(item.memberId);
        const requestId = crypto.randomUUID();
        const body = JSON.stringify({
          action: item.action,
          data: { ...item.data, memberId: item.memberId, version },
          requestId,
        });
        item = { ...item, attempt: { requestId, body } };
        update(item); // persist before sending so a lost reply replays safely
      }
      const r = await fetch("/api/journey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: item.attempt!.body,
        signal: AbortSignal.timeout(25000),
      });
      if (r.ok) return "sent";
      const x = await r.json().catch(() => ({}));
      const message = String(x.message || "Unable to save.");
      if (r.status === 409 && round < 2) {
        // Not applied: rebuild with the latest version and try again.
        item = { ...item, attempt: null };
        update(item);
        continue;
      }
      if (r.status >= 500 || r.status === 429 || r.status === 401) {
        update({ ...item, tries: item.tries + 1, error: null });
        return "retry";
      }
      update({ ...item, tries: item.tries + 1, error: message });
      return "rejected";
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status && status >= 400 && status < 500 && status !== 401 && status !== 429) {
        update({
          ...item,
          tries: item.tries + 1,
          error: e instanceof Error ? e.message : "Unable to save.",
        });
        return "rejected";
      }
      update({ ...item, tries: item.tries + 1, error: null });
      return "retry";
    }
  }
  return "retry";
}

let running: Promise<{ sent: number; waiting: number; failed: number }> | null =
  null;

/** Sends waiting updates in order. Safe to call often; runs one at a time. */
export function flushOutbox(
  user: string,
  onSent?: (item: OutboxItem) => void,
): Promise<{ sent: number; waiting: number; failed: number }> {
  if (running) return running;
  running = (async () => {
    let sent = 0;
    const items = loadOutbox(user);
    for (const original of items) {
      if (original.error) continue; // needs the Friend's decision
      const update = (next: OutboxItem) =>
        saveOutbox(
          user,
          loadOutbox(user).map((i) => (i.id === next.id ? next : i)),
        );
      const result = await sendOne(user, original, update);
      if (result === "sent") {
        saveOutbox(
          user,
          loadOutbox(user).filter((i) => i.id !== original.id),
        );
        markDoneSent(user, original.id);
        sent++;
        onSent?.(original);
      } else if (result === "retry") {
        break; // keep order; try again later
      }
    }
    const left = loadOutbox(user);
    return {
      sent,
      waiting: left.filter((i) => !i.error).length,
      failed: left.filter((i) => i.error).length,
    };
  })().finally(() => {
    running = null;
  });
  return running;
}

export function discardItem(user: string, id: string) {
  saveOutbox(
    user,
    loadOutbox(user).filter((i) => i.id !== id),
  );
}
export function retryItem(user: string, id: string) {
  saveOutbox(
    user,
    loadOutbox(user).map((i) =>
      i.id === id ? { ...i, error: null, attempt: null } : i,
    ),
  );
}
