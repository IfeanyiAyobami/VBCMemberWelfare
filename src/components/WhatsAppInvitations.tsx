"use client";
import { useEffect, useRef, useState } from "react";
type Campaign = {
  id: string;
  title: string;
  body: string;
  flyer: string;
  template_name: string | null;
  language: string;
};
type Message = {
  id: string;
  campaign_id: string;
  actor: string;
  mode: string;
  body: string;
  state: string;
  error_code: string | null;
  created_at: string;
  recorded_at: string | null;
  outcome: string | null;
  provider_id: string | null;
  retry_allowed?: boolean;
};
type Snapshot = {
  actor?: string;
  coordinator: boolean;
  contact_allowed: boolean;
  permission: { allowed: boolean; evidence: string } | null;
  campaigns: Campaign[];
  messages: Message[];
  replies: { provider_id: string; body: string; received_at: string }[];
  apiReady: boolean;
};
const labels: Record<string, string> = {
  opened: "WhatsApp handoff prepared · sending not confirmed",
  queued: "Queued",
  sending: "Submitting · do not resend",
  accepted: "Accepted by Meta · not yet delivered",
  sent: "Sent by Meta",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed · review details",
  unknown: "Result uncertain · do not resend",
  staff_sent: "Staff reported sent",
  staff_replied: "Staff reported reply",
  staff_unsent: "Staff reported not sent",
};
const stamp = (s: string) =>
  new Date(s).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  });
export default function WhatsAppInvitations({
  memberId,
  name,
  onSaved,
}: {
  memberId: string;
  name: string;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Snapshot | null>(null),
    [campaignId, setCampaignId] = useState(""),
    [mode, setMode] = useState("assisted"),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [handoff, setHandoff] = useState<{
      id: string;
      recipient: string;
      body: string;
    } | null>(null),
    [recordId, setRecordId] = useState(""),
    [paid, setPaid] = useState(false);
  const request = useRef<{ key: string; id: string } | null>(null),
    alive = useRef(true),
    popup = useRef<HTMLDialogElement>(null);
  const campaign = data?.campaigns.find((c) => c.id === campaignId);
  async function load() {
    const r = await fetch("/api/whatsapp?memberId=" + memberId, {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      }),
      x = await r.json();
    if (!r.ok) throw Error(x.message);
    if (alive.current) setData(x);
  }
  useEffect(() => {
    alive.current = true;
    void load().catch((e) => setError(e.message));
    return () => {
      alive.current = false;
    };
  }, [memberId]);
  useEffect(() => {
    if (!campaignId && data?.campaigns[0]) setCampaignId(data.campaigns[0].id);
  }, [data, campaignId]);
  useEffect(() => {
    setText(campaign?.body.replace("{{1}}", name) || "");
    setHandoff(null);
    request.current = null;
    setPaid(false);
  }, [campaignId, mode, campaign?.body, name]);
  useEffect(() => {
    if (error && popup.current && !popup.current.open)
      popup.current.showModal();
  }, [error]);
  useEffect(() => {
    if (
      !data?.messages.some((m) =>
        ["sending", "queued", "accepted", "sent", "unknown"].includes(m.state),
      )
    )
      return;
    const t = setInterval(() => void load().catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [data]);
  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      }),
      x = await r.json();
    if (!r.ok) throw Error(x.message);
    return x.result;
  }
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  function prepare() {
    void run(async () => {
      const key = JSON.stringify({ campaignId, mode, text });
      if (request.current?.key !== key)
        request.current = { key, id: crypto.randomUUID() };
      const x = await post({
        action: "prepare",
        memberId,
        campaignId,
        mode,
        body: text,
        confirmPaid: paid,
        requestId: request.current.id,
      });
      if (mode === "assisted") {
        setHandoff(x);
        setRecordId(x.id);
        setNotice(
          "Message prepared. Download the flyer, open WhatsApp and attach it before sending.",
        );
      } else
        setNotice(
          "API submission processed. Check the status below; acceptance is not proof of delivery.",
        );
    });
  }
  return (
    <section className="vj-panel wa-invitations">
      <div className="vj-panel-head">
        <div>
          <span className="vj-eyebrow">PERSONAL INVITATIONS</span>
          <h2>WhatsApp, your way</h2>
        </div>
        <button
          className="vj-secondary"
          disabled={busy}
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          Refresh status
        </button>
      </div>
      <p className="vj-hint">
        Send from your own phone, or from the church line once it is set up. Flyer
        first, message underneath.
      </p>
      {notice && (
        <p role="status" className="wa-notice">
          {notice}
        </p>
      )}
      {!data ? (
        <p>Loading invitations…</p>
      ) : (
        <>
          <div className="wa-permission">
            <strong>
              {!data.contact_allowed
                ? "Outreach paused"
                : data.permission?.allowed
                  ? "WhatsApp permission recorded"
                  : data.permission?.allowed === false
                    ? "WhatsApp opted out"
                    : "WhatsApp permission not yet recorded"}
            </strong>
            <details>
              <summary>Update WhatsApp permission</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await post({
                      action: "permission",
                      memberId,
                      allowed: f.get("allowed") === "true",
                      evidence: f.get("evidence"),
                    });
                    setNotice(
                      "WhatsApp permission updated. Other channel preferences are unchanged.",
                    );
                  });
                }}
              >
                <label>
                  Permission
                  <select name="allowed" aria-label="WhatsApp permission">
                    <option value="true">Agreed to WhatsApp messages</option>
                    <option value="false">Do not contact on WhatsApp</option>
                  </select>
                </label>
                <label>
                  When and how this was confirmed
                  <input
                    name="evidence"
                    required
                    minLength={5}
                    maxLength={1000}
                  />
                </label>
                <button className="vj-secondary" disabled={busy}>
                  Save permission
                </button>
              </form>
            </details>
            <p className="vj-hint">
              API sending requires explicit WhatsApp permission. Existing Member
              Care opt-outs and paused outreach always apply.
            </p>
          </div>
          <div className="wa-methods" aria-label="WhatsApp sending method">
            <button
              className={mode === "assisted" ? "vj-primary" : "vj-secondary"}
              aria-pressed={mode === "assisted"}
              onClick={() => setMode("assisted")}
              disabled={busy}
            >
              From my phone <small>You press send in WhatsApp</small>
            </button>
            <button
              className={mode === "api" ? "vj-primary" : "vj-secondary"}
              aria-pressed={mode === "api"}
              onClick={() => setMode("api")}
              disabled={busy || !data.coordinator}
            >
              Church line · Official API{" "}
              <small>
                {data.coordinator
                  ? "Paid send from church line"
                  : "Coordinator access required"}
              </small>
            </button>
          </div>
          <label>
            Invitation
            <select
              value={campaignId}
              aria-label="WhatsApp invitation"
              onChange={(e) => setCampaignId(e.target.value)}
              disabled={busy}
            >
              <option value="">Choose an invitation</option>
              {data.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          {!data.campaigns.length && (
            <p className="vj-hint">
              A Coordinator can create the first invitation below.
            </p>
          )}
          {campaign && (
            <>
              <div className="wa-compose">
                <div className="wa-flyer">
                  <img
                    src={campaign.flyer}
                    alt="Sunday invitation: Spring Service 8 AM, Glorious Worship 10 AM, Vine Branch Church, Mokola, Ibadan"
                  />
                  <a
                    href={campaign.flyer}
                    download="VBC_Sunday_Invitation.jpg"
                    className="vj-secondary"
                  >
                    Download flyer
                  </a>
                </div>
                <div>
                  <label>
                    Invitation text
                    <textarea
                      rows={10}
                      aria-label="WhatsApp invitation text"
                      value={text}
                      readOnly={mode === "api"}
                      maxLength={2500}
                      onChange={(e) => {
                        setText(e.target.value);
                        setHandoff(null);
                      }}
                    />
                  </label>
                  <p className="vj-hint">
                    {mode === "api"
                      ? "This must match the approved Meta template. The flyer is its image header."
                      : "The text opens in WhatsApp. Download and attach the flyer there before sending. The active WhatsApp account on your device is the sender."}
                  </p>
                  {mode === "api" && (
                    <>
                      <p className="wa-notice">
                        {data.apiReady
                          ? "API configured · Meta template approval is checked before sending."
                          : "API not configured. Staff-assisted sending is available."}
                      </p>
                      <label className="wa-check">
                        <input
                          type="checkbox"
                          checked={paid}
                          onChange={(e) => setPaid(e.target.checked)}
                        />
                        I confirm this paid send to {name}.
                      </label>
                      <p className="vj-hint">
                        Provider charges apply. One API invitation per person
                        per campaign. No automatic resend after uncertain
                        results.
                      </p>
                    </>
                  )}
                  <button
                    className="vj-primary"
                    disabled={
                      busy ||
                      !data.contact_allowed ||
                      data.permission?.allowed === false ||
                      (mode === "api" &&
                        (!data.apiReady ||
                          !campaign.template_name ||
                          !data.permission?.allowed ||
                          !paid))
                    }
                    onClick={prepare}
                  >
                    {busy
                      ? "Working…"
                      : mode === "api"
                        ? "Send paid API invitation"
                        : "Prepare WhatsApp handoff"}
                  </button>
                  {handoff && mode === "assisted" && (
                    <div className="wa-handoff">
                      <a
                        className="vj-primary"
                        target="_blank"
                        rel="noopener noreferrer"
                        href={
                          "https://wa.me/" +
                          handoff.recipient.replace(/\D/g, "") +
                          "?text=" +
                          encodeURIComponent(handoff.body)
                        }
                      >
                        Open WhatsApp ↗
                      </a>
                      <p className="vj-hint">
                        Opening this link does not send the message or record
                        delivery.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {data.coordinator && (
            <details className="wa-campaign" open={data.campaigns.length === 0}>
              <summary>Create an invitation</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    f = new FormData(form);
                  void run(async () => {
                    const id = await post({
                      action: "campaign",
                      title: f.get("title"),
                      body: f.get("body"),
                      template: f.get("template"),
                      language: f.get("language"),
                    });
                    setCampaignId(id);
                    form.reset();
                    setNotice(
                      "Invitation created. API mode checks the exact approved image template before dispatch.",
                    );
                  });
                }}
              >
                <label>
                  Invitation title
                  <input
                    name="title"
                    required
                    minLength={3}
                    maxLength={100}
                    placeholder="Sunday invitation · November"
                  />
                </label>
                <label>
                  Message / exact approved template body
                  <textarea
                    name="body"
                    required
                    minLength={5}
                    maxLength={2000}
                    rows={7}
                    defaultValue={
                      "Hi {{1}},\nWe would love to see you this Sunday at Vine Branch Church.\nSpring Service: 8 AM. Glorious Worship: 10 AM.\nNo 1, Olubadan Palace Road, off Queen Elizabeth Road, Mokola, Ibadan.\nWould you like help with directions?"
                    }
                  />
                </label>
                <p className="vj-hint">
                  Use {"{{1}}"} once for the person’s name. This release
                  includes the supplied Sunday flyer. Create a new invitation
                  for a new campaign; saved invitations retain their original
                  text.
                </p>
                <div className="wa-form-grid">
                  <label>
                    Approved Meta template name · optional
                    <input
                      name="template"
                      pattern="[a-z0-9_]+"
                      maxLength={100}
                      placeholder="vbc_sunday_invitation"
                    />
                  </label>
                  <label>
                    Template language
                    <input
                      name="language"
                      required
                      pattern="[a-zA-Z_]{2,10}"
                      defaultValue="en"
                    />
                  </label>
                </div>
                <p className="vj-hint">
                  Leave the template name blank for staff-assisted only. API
                  templates must use an image header and this exact body, with
                  no buttons or named parameters.
                </p>
                <button className="vj-secondary" disabled={busy}>
                  Create invitation
                </button>
              </form>
            </details>
          )}
          <div className="wa-history">
            <h3>Invitation history</h3>
            {!data.messages.length && (
              <p className="vj-hint">No WhatsApp invitations prepared yet.</p>
            )}
            {data.messages.map((m) => (
              <article key={m.id}>
                <div>
                  <strong>{labels[m.state] || m.state}</strong>
                  <p className="vj-hint">
                    {m.mode === "api" ? "Official API" : "Staff-assisted"} ·{" "}
                    {stamp(m.created_at)}
                  </p>
                  {m.error_code && (
                    <p className="vj-hint">Reference: {m.error_code}</p>
                  )}
                  {m.provider_id && (
                    <details>
                      <summary>Provider reference</summary>
                      <p className="wa-id">{m.provider_id}</p>
                    </details>
                  )}
                  {m.mode === "api" &&
                    ["sending", "unknown"].includes(m.state) && (
                      <p className="vj-hint">
                        Check Meta’s logs or wait for a webhook. Sending again
                        could duplicate the invitation.
                      </p>
                    )}
                </div>
                {m.mode === "api" &&
                  m.state === "failed" &&
                  m.retry_allowed &&
                  data.coordinator && (
                    <button
                      className="vj-secondary"
                      disabled={busy}
                      onClick={() => {
                        setCampaignId(m.campaign_id);
                        setMode("api");
                        request.current = null;
                        setPaid(false);
                        setNotice(
                          "This attempt was rejected before acceptance. Review the cause, then confirm a new paid attempt.",
                        );
                      }}
                    >
                      Review safe retry
                    </button>
                  )}
                {m.mode === "api" &&
                  m.state === "queued" &&
                  data.coordinator &&
                  m.actor === data.actor && (
                    <button
                      className="vj-secondary"
                      disabled={busy || !data.apiReady}
                      onClick={() =>
                        void run(async () => {
                          await post({
                            action: "prepare",
                            memberId,
                            campaignId: m.campaign_id,
                            mode: "api",
                            body: m.body,
                            requestId: m.id,
                            confirmPaid: true,
                          });
                          setNotice(
                            "Queued send resumed with the original request ID. Check its saved status.",
                          );
                        })
                      }
                    >
                      Resume paid queued send
                    </button>
                  )}
                {!m.recorded_at && (
                  <button
                    className="vj-secondary"
                    onClick={() => setRecordId(m.id)}
                    disabled={busy}
                  >
                    Record outcome
                  </button>
                )}
                {m.recorded_at && (
                  <p className="vj-hint">
                    Staff outcome: {m.outcome} · {stamp(m.recorded_at)}
                  </p>
                )}
              </article>
            ))}
          </div>
          {recordId &&
            data.messages.some((m) => m.id === recordId && !m.recorded_at) && (
              <form
                className="wa-record"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await post({
                      action: "record",
                      messageId: recordId,
                      outcome: f.get("outcome"),
                      note: f.get("note"),
                      next: f.get("next")
                        ? new Date(String(f.get("next"))).toISOString()
                        : null,
                    });
                    setRecordId("");
                    setNotice(
                      "Activity saved as staff-reported. Only a reported reply counts as a successful conversation.",
                    );
                  });
                }}
              >
                <h3>Record the actual outcome</h3>
                <label>
                  Outcome
                  <select name="outcome" aria-label="WhatsApp activity outcome">
                    <option value="sent">Sent · awaiting reply</option>
                    <option value="replied">Replied · conversation held</option>
                    <option value="unsent">Could not send</option>
                  </select>
                </label>
                <label>
                  Note
                  <textarea
                    name="note"
                    required
                    minLength={3}
                    maxLength={2000}
                    rows={3}
                  />
                </label>
                <label>
                  Next contact · optional
                  <input name="next" type="datetime-local" />
                </label>
                <button className="vj-primary" disabled={busy}>
                  Save WhatsApp activity
                </button>
              </form>
            )}
          <div className="wa-replies">
            <h3>Replies received through API</h3>
            {!data.replies.length ? (
              <p className="vj-hint">
                No API replies recorded. Staff-assisted conversations stay in
                WhatsApp until staff record the outcome.
              </p>
            ) : (
              data.replies.map((r) => (
                <article key={r.provider_id}>
                  <p style={{ whiteSpace: "pre-wrap" }}>{r.body}</p>
                  <p className="vj-hint">
                    {stamp(r.received_at)} · received via Meta webhook
                  </p>
                </article>
              ))
            )}
          </div>
        </>
      )}
      <dialog
        ref={popup}
        className="wa-error-dialog"
        onCancel={() => setError("")}
      >
        <div>
          <span className="vj-eyebrow">WHATSAPP INVITATION</span>
          <h2>We couldn’t finish that</h2>
          <p>{error}</p>
          <p className="vj-hint">
            Your entered details are retained. Check the saved status before
            repeating a paid send.
          </p>
          <button
            className="vj-primary"
            onClick={() => {
              popup.current?.close();
              setError("");
            }}
          >
            Back to invitation
          </button>
        </div>
      </dialog>
    </section>
  );
}
