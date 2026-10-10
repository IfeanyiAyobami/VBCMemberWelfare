"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  GUEST_OPTIONS,
  GUEST_LIMITS,
  GUEST_STATUSES,
  emptyGuest,
  validateGuest,
  type GuestDraft,
  type GuestRecord,
  type Match,
} from "@/lib/guests/model";
import {
  PREFERENCE_LABELS,
  validEvidence,
  type Preferences,
  type CarePage,
} from "@/lib/members/care-model";
import { todayInLagos, type FieldErrors } from "@/lib/members/model";
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
const labels: Record<keyof typeof GUEST_LIMITS, string> = {
  surname: "Surname",
  other_names: "First and other names",
  visit_date: "Date of visit",
  occupation: "Occupation",
  gender: "Gender",
  age_range: "Age range",
  marital_status: "Marital status",
  phone: "Phone number",
  whatsapp: "WhatsApp number (original card)",
  email: "Email address",
  residential_address: "Residential address",
  born_again: "Born again",
  home_visit: "Home visit requested",
  discovery_source: "Heard about us through",
  discovery_details: "Anything else to share",
  invited_by: "Personally invited by",
  birthday: "Birthday (MM-DD)",
  anniversary: "Wedding anniversary (MM-DD)",
};
const groups: (keyof typeof GUEST_LIMITS)[][] = [
  [
    "surname",
    "other_names",
    "visit_date",
    "occupation",
    "gender",
    "age_range",
    "marital_status",
  ],
  [
    "phone",
    "whatsapp",
    "email",
    "residential_address",
    "birthday",
    "anniversary",
  ],
  [
    "born_again",
    "home_visit",
    "discovery_source",
    "discovery_details",
    "invited_by",
  ],
];
const groupNames = [
  "About the guest",
  "Contact & milestones",
  "Faith & visit",
  "Permissions & review",
];
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "We could not complete this request. Check your connection and try again.";
}
function time(value: string) {
  return (
    new Date(value).toLocaleString("en-GB", {
      timeZone: "Africa/Lagos",
      dateStyle: "medium",
      timeStyle: "short",
    }) + " · Lagos"
  );
}
function Status({ guest }: { guest: GuestRecord }) {
  return (
    <span
      className={
        "badge " +
        (guest.status === "pending"
          ? "amber"
          : guest.status === "rejected"
            ? "red"
            : "green")
      }
    >
      {GUEST_STATUSES[guest.status]}
    </span>
  );
}
function Details({ guest }: { guest: GuestDraft }) {
  return (
    <div className="guest-details">
      {groups.map((keys, i) => (
        <section key={i}>
          <h3>{groupNames[i]}</h3>
          <dl className="detail-list">
            {keys.map((key) => (
              <div key={key}>
                <dt>{labels[key]}</dt>
                <dd>{guest[key] || "Not provided"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
function Choices({ guest }: { guest: GuestDraft }) {
  return (
    <ul className="guest-choices">
      {Object.entries(PREFERENCE_LABELS).map(([key, label]) => (
        <li key={key}>
          <span>{label}</span>
          <strong
            className={
              "badge " + (guest[key as keyof Preferences] ? "green" : "blue")
            }
          >
            {guest[key as keyof Preferences] ? "Selected" : "Not selected"}
          </strong>
        </li>
      ))}
    </ul>
  );
}
export default function GuestDesk({
  request,
  canEdit,
  guestId,
}: {
  request: Request;
  canEdit: boolean;
  guestId?: string;
}) {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("pending"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<CarePage<GuestRecord> | null>(null),
    [detail, setDetail] = useState<{
      guest: GuestRecord;
      matches: Match[];
    } | null>(null),
    [error, setError] = useState(""),
    [editor, setEditor] = useState(false),
    [saved, setSaved] = useState<GuestRecord | null>(null);
  useEffect(() => {
    if (!canEdit) setEditor(false);
  }, [canEdit]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setData(null);
    setDetail(null);
    const path = guestId
      ? "/api/guests/" + guestId
      : "/api/guests?" +
        new URLSearchParams({ page: String(page), status, q: query });
    void request<
      CarePage<GuestRecord> | { guest: GuestRecord; matches: Match[] }
    >(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          if ("guest" in result) setDetail(result);
          else setData(result);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(message(e));
      });
    return () => controller.abort();
  }, [request, guestId, page, status, query, revision]);
  return (
    <div className="guest-desk">
      {saved && (
        <div className="notice member-save-notice" role="status">
          <strong>Guest card saved.</strong>
          <span>Awaiting staff review.</span>
          <a className="text-link" href={"/guest/" + saved.id}>
            Review {saved.other_names} {saved.surname} →
          </a>
        </div>
      )}
      {guestId ? (
        <a className="text-link" href="/guests">
          ← All guest submissions
        </a>
      ) : (
        <>
          <div className="page-head">
            <div>
              <div className="eyebrow">
                A warm welcome, a lasting connection
              </div>
              <h1>Guest submissions</h1>
              <p>
                Every visit deserves care. Review each card before adding it to
                the church family.
              </p>
            </div>
            {canEdit ? (
              <button className="btn primary" onClick={() => setEditor(true)}>
                ＋ Record a guest card
              </button>
            ) : (
              <span className="badge blue">View access</span>
            )}
          </div>
          <div className="notice mb">
            <strong>Elementor connection</strong>
            <p className="mt">
              Website cards appear here after the WordPress bridge is installed
              and enabled. Manual cards can be saved now; messaging remains
              paused.
            </p>
          </div>
          <form
            className="toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setQuery(search.trim());
            }}
          >
            <label className="searchbox">
              <span className="sr-only">Search guest name, email or phone</span>
              <input
                type="search"
                value={search}
                maxLength={120}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search guest name, email or phone"
              />
            </label>
            <button className="btn">Search</button>
            <select
              aria-label="Filter guest status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All submissions</option>
              {Object.entries(GUEST_STATUSES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setSearch("");
                setQuery("");
                setStatus("pending");
                setPage(1);
                setRevision((v) => v + 1);
              }}
            >
              Reset
            </button>
          </form>
        </>
      )}
      {error ? (
        <div className="notice red mt" role="alert">
          {error}
          <button className="btn mt" onClick={() => setRevision((v) => v + 1)}>
            Reload submissions
          </button>
        </div>
      ) : !data && !detail ? (
        <p className="hint mt" role="status">
          Loading saved guest cards…
        </p>
      ) : null}
      {data && (
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Visit</th>
                  <th>Source</th>
                  <th>Review</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <div className="name-cell">
                        <span className="avatar">
                          {g.other_names[0]}
                          {g.surname[0]}
                        </span>
                        <div>
                          <a className="text-link" href={"/guest/" + g.id}>
                            {g.other_names} {g.surname}
                          </a>
                          <small>{g.email || g.phone}</small>
                        </div>
                      </div>
                    </td>
                    <td>{g.visit_date}</td>
                    <td>
                      {g.source === "wordpress"
                        ? "Elementor website"
                        : "Staff card"}
                    </td>
                    <td>
                      <Status guest={g} />
                    </td>
                    <td>
                      <a className="text-link" href={"/guest/" + g.id}>
                        Review card →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.items.length && (
            <div className="list-empty">
              <div className="empty-symbol">♡</div>
              <h2>No guest cards in this view</h2>
              <p className="hint mt">
                Record a test card or try another filter.
              </p>
            </div>
          )}
          <div className="card-pad care-pager">
            <small>
              {data.total} submissions · Page {data.page} of{" "}
              {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </small>
            <div className="actions">
              <button
                className="btn"
                disabled={data.page === 1}
                onClick={() => setPage(data.page - 1)}
              >
                Previous
              </button>
              <button
                className="btn"
                disabled={data.page * data.pageSize >= data.total}
                onClick={() => setPage(data.page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
      {detail && (
        <GuestReview
          key={detail.guest.id + ":" + detail.guest.version}
          {...detail}
          request={request}
          canEdit={canEdit}
          onReviewed={(guest) => {
            setDetail({ ...detail, guest });
          }}
          onReload={() => setRevision((v) => v + 1)}
        />
      )}
      {editor && canEdit && (
        <GuestEditor
          request={request}
          onClose={() => setEditor(false)}
          onSaved={(guest) => {
            setEditor(false);
            setSaved(guest);
            setPage(1);
            setRevision((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
function Modal({
  title,
  busy,
  onClose,
  children,
  footer,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal member-editor care-dialog guest-dialog"
      aria-labelledby="guest-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id="guest-modal-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close guest form"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="modal-body">{children}</div>
      <div className="modal-foot">{footer}</div>
    </dialog>
  );
}
function GuestEditor({
  request,
  onClose,
  onSaved,
}: {
  request: Request;
  onClose: () => void;
  onSaved: (g: GuestRecord) => void;
}) {
  const [draft, setDraft] = useState(emptyGuest),
    [step, setStep] = useState(0),
    [errors, setErrors] = useState<FieldErrors>({}),
    [evidence, setEvidence] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const requestId = useRef("");
  useEffect(() => {
    requestId.current = crypto.randomUUID();
  }, []);
  const form = useRef<HTMLFormElement>(null);
  function next() {
    const validation = validateGuest(draft);
    const all = validation.ok ? {} : validation.errors;
    const fields = groups[step] || [];
    const local = Object.fromEntries(
      Object.entries(all).filter(([key]) =>
        fields.includes(key as keyof typeof GUEST_LIMITS),
      ),
    );
    setErrors(local);
    if (Object.keys(local).length) {
      form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }
    setStep(step + 1);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (step < 3) {
      next();
      return;
    }
    const validation = validateGuest(draft);
    if (!validation.ok) {
      setErrors(validation.errors);
      setError("Check the highlighted fields.");
      for (let i = 0; i < 3; i++)
        if (groups[i].some((k) => validation.errors[k])) {
          setStep(i);
          break;
        }
      return;
    }
    if (!validEvidence(evidence)) {
      setError("Record how these choices were confirmed (10–2000 characters).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await request<{ guest: GuestRecord }>("/api/guests", {
        method: "POST",
        body: JSON.stringify({
          ...validation.value,
          requestId: requestId.current,
          evidence: evidence.trim(),
        }),
      });
      onSaved(result.guest);
    } catch (e) {
      setError(message(e));
      if (e && typeof e === "object" && "fields" in e)
        setErrors(e.fields as FieldErrors);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Record a guest card"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            disabled={busy}
            onClick={() => (step ? setStep(step - 1) : onClose())}
          >
            {step ? "Back" : "Cancel"}
          </button>
          <button
            className="btn primary"
            form="guest-intake-form"
            disabled={busy}
          >
            {busy ? "Saving…" : step === 3 ? "Save for review" : "Continue"}
          </button>
        </>
      }
    >
      <form id="guest-intake-form" ref={form} onSubmit={save} noValidate>
        <ol className="guest-stepper" aria-label="Guest card progress">
          {groupNames.map((name, i) => (
            <li key={name} aria-current={i === step ? "step" : undefined}>
              <span>{i + 1}</span>
              {name}
            </li>
          ))}
        </ol>
        <h3 tabIndex={-1}>{groupNames[step]}</h3>
        <p className="hint mb">
          Step {step + 1} of 4 · Required fields have an asterisk.
        </p>
        {step < 3 ? (
          <div className="fields-grid">
            {groups[step].map((key) => {
              const required = [
                  "surname",
                  "other_names",
                  "visit_date",
                  "phone",
                ].includes(key),
                options = GUEST_OPTIONS[key as keyof typeof GUEST_OPTIONS];
              const text = [
                "residential_address",
                "discovery_details",
                "invited_by",
              ].includes(key);
              const props = {
                id: "guest-" + key,
                name: key,
                value: draft[key],
                disabled: busy,
                "aria-invalid": !!errors[key],
                "aria-describedby": errors[key]
                  ? "guest-error-" + key
                  : undefined,
                onChange: (
                  e: React.ChangeEvent<
                    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                  >,
                ) => setDraft({ ...draft, [key]: e.target.value }),
              };
              return (
                <div className={"field " + (text ? "full" : "")} key={key}>
                  <label htmlFor={props.id}>
                    {labels[key]}
                    {required ? " *" : " · Optional"}
                  </label>
                  {options ? (
                    <select {...props}>
                      <option value="">Not provided</option>
                      {options.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  ) : text ? (
                    <textarea
                      {...props}
                      maxLength={GUEST_LIMITS[key]}
                      rows={3}
                    />
                  ) : (
                    <input
                      {...props}
                      type={
                        key === "visit_date"
                          ? "date"
                          : key === "email"
                            ? "email"
                            : ["phone", "whatsapp"].includes(key)
                              ? "tel"
                              : "text"
                      }
                      max={key === "visit_date" ? todayInLagos() : undefined}
                      maxLength={GUEST_LIMITS[key]}
                      placeholder={
                        ["birthday", "anniversary"].includes(key)
                          ? "e.g. 07-22"
                          : undefined
                      }
                    />
                  )}{" "}
                  {errors[key] && (
                    <small
                      id={"guest-error-" + key}
                      className="member-field-error"
                    >
                      {errors[key]}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <p className="hint">
              Choose only what the guest explicitly agreed to. Email and SMS are
              separate from message topics.
            </p>
            <fieldset className="care-consent-fields" disabled={busy}>
              <legend>Guest choices</legend>
              {Object.entries(PREFERENCE_LABELS).map(([key, label]) => (
                <label className="care-consent-choice" key={key}>
                  <strong>
                    {label}
                    {key === "contact_consent" ? " *" : ""}
                  </strong>
                  <input
                    name={key}
                    type="checkbox"
                    checked={draft[key as keyof Preferences]}
                    aria-invalid={!!errors[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.checked })
                    }
                  />
                </label>
              ))}
              {errors.contact_consent && (
                <p className="member-field-error">{errors.contact_consent}</p>
              )}
              <label className="mt" htmlFor="guest-evidence">
                How were these choices confirmed? *
              </label>
              <textarea
                id="guest-evidence"
                value={evidence}
                maxLength={2000}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="For example: entered from the guest’s signed card, with each selected choice confirmed."
                rows={3}
              />
            </fieldset>
            <details className="mt">
              <summary>Check the complete guest card</summary>
              <Details guest={draft} />
            </details>
          </>
        )}
        {error && (
          <div className="notice red mt" role="alert">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
function GuestReview({
  guest,
  matches,
  request,
  canEdit,
  onReviewed,
  onReload,
}: {
  guest: GuestRecord;
  matches: Match[];
  request: Request;
  canEdit: boolean;
  onReviewed: (g: GuestRecord) => void;
  onReload: () => void;
}) {
  const [action, setAction] = useState<"create" | "link" | "reject" | null>(
      null,
    ),
    [target, setTarget] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const memberId = useRef("");
  useEffect(() => {
    memberId.current = crypto.randomUUID();
  }, []);
  useEffect(() => {
    if (!canEdit) setAction(null);
  }, [canEdit]);
  const match = matches.find((m) => m.id === target);
  async function review(e: FormEvent) {
    e.preventDefault();
    if (busy || !action) return;
    setError("");
    if (action === "link" && (!match || match.archivedAt || !confirmed)) {
      setError(
        "Choose an active matching profile and confirm the guest’s identity.",
      );
      return;
    }
    if (action === "reject" && notes.trim().length < 10) {
      setError("Enter a reason of at least 10 characters.");
      return;
    }
    setBusy(true);
    try {
      const result = await request<{ guest: GuestRecord }>(
        "/api/guests/" + guest.id + "/review",
        {
          method: "POST",
          body: JSON.stringify({
            action,
            memberId:
              action === "create"
                ? memberId.current
                : action === "link"
                  ? target
                  : null,
            targetVersion: action === "link" ? match?.version : null,
            expectedVersion: guest.version,
            identityConfirmed: confirmed,
            notes: notes.trim(),
          }),
        },
      );
      setAction(null);
      onReviewed(result.guest);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-head mt">
        <div>
          <div className="eyebrow">A guest worth remembering</div>
          <h1>
            {guest.other_names} {guest.surname}
          </h1>
          <p>
            Received {time(guest.createdAt)} ·{" "}
            {guest.source === "wordpress"
              ? "Elementor website"
              : "Entered by " + guest.enteredBy}
          </p>
        </div>
        <Status guest={guest} />
      </div>
      <div className="grid two guest-review-grid">
        <section className="card">
          <div className="card-head">
            <h2>The submitted card</h2>
          </div>
          <div className="card-pad">
            <Details guest={guest} />
          </div>
        </section>
        <div>
          <section className="card">
            <div className="card-head">
              <h2>Recorded permission</h2>
            </div>
            <div className="card-pad">
              <Choices guest={guest} />
              <div className="care-evidence">
                <strong>Evidence · Policy {guest.policy}</strong>
                <p>
                  {guest.evidence ||
                    "No evidence was recorded on this older card."}
                </p>
              </div>
              <p className="hint mt">
                Receiving a card does not send a message.
              </p>
            </div>
          </section>
          <section className="card mt">
            <div className="card-head">
              <h2>
                {guest.status === "pending"
                  ? "Review this visit"
                  : "Review outcome"}
              </h2>
            </div>
            <div className="card-pad">
              {guest.status === "pending" ? (
                <>
                  <p className="hint">
                    Contact matches are clues. Confirm the person before
                    linking; shared family contacts can belong to different
                    people.
                  </p>
                  <div className="guest-matches">
                    {matches.length ? (
                      matches.map((m) => (
                        <label className="guest-match" key={m.id}>
                          {canEdit && (
                            <input
                              type="radio"
                              name="matching-member"
                              value={m.id}
                              checked={target === m.id}
                              disabled={!!m.archivedAt}
                              onChange={() => {
                                setTarget(m.id);
                                setConfirmed(false);
                              }}
                            />
                          )}
                          <span>
                            <strong>
                              {m.first} {m.last}
                            </strong>
                            <small>
                              {m.phone}
                              {m.email ? " · " + m.email : ""}
                            </small>
                            <small>
                              Matches{" "}
                              {m.matchPhone && m.matchEmail
                                ? "phone and email"
                                : m.matchPhone
                                  ? "phone"
                                  : "email"}
                              {m.archivedAt
                                ? " · Archived — restore first"
                                : ""}
                            </small>
                            <a className="text-link" href={"/profile/" + m.id}>
                              Open existing profile →
                            </a>
                          </span>
                        </label>
                      ))
                    ) : (
                      <div className="care-empty">
                        <strong>No existing contact matches</strong>
                        <p className="hint mt">
                          You can create a visitor record after reviewing the
                          card.
                        </p>
                      </div>
                    )}
                  </div>
                  {canEdit ? (
                    <div className="guest-review-actions">
                      <button
                        className="btn primary"
                        disabled={matches.length > 0}
                        onClick={() => {
                          setAction("create");
                          setError("");
                        }}
                      >
                        Create visitor record
                      </button>
                      <button
                        className="btn"
                        disabled={!match || !!match.archivedAt}
                        onClick={() => {
                          setAction("link");
                          setError("");
                        }}
                      >
                        Link selected member
                      </button>
                      <button
                        className="btn"
                        onClick={() => {
                          setAction("reject");
                          setError("");
                        }}
                      >
                        Reject card
                      </button>
                    </div>
                  ) : (
                    <p className="hint mt">
                      An editor or administrator can review this card.
                    </p>
                  )}
                  {matches.length > 0 && (
                    <p className="hint mt">
                      Creating a duplicate contact is blocked. Restore an
                      archived match before linking, or record a reason for
                      rejection.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p>
                    <strong>{GUEST_STATUSES[guest.status]}</strong>
                  </p>
                  <p className="hint mt">
                    {guest.reviewer}
                    {guest.reviewedAt ? " · " + time(guest.reviewedAt) : ""}
                  </p>
                  {guest.reviewNotes && (
                    <p className="guest-text mt">{guest.reviewNotes}</p>
                  )}
                  {guest.memberId && (
                    <a className="btn mt" href={"/profile/" + guest.memberId}>
                      Open member profile →
                    </a>
                  )}
                  {guest.status === "duplicate" && (
                    <p className="hint mt">
                      The existing profile and its permissions were retained.
                    </p>
                  )}
                  {guest.status === "unlinked" && (
                    <p className="hint mt">
                      This older card needs administrator follow-up. It cannot
                      be processed as a new pending card.
                    </p>
                  )}
                </>
              )}
              <button className="text-link guest-reload mt" onClick={onReload}>
                Reload saved card
              </button>
            </div>
          </section>
        </div>
      </div>
      {action && canEdit && (
        <Modal
          title={
            action === "create"
              ? "Create a visitor record"
              : action === "link"
                ? "Link this visit to a member"
                : "Reject this guest card"
          }
          busy={busy}
          onClose={() => setAction(null)}
          footer={
            <>
              <button
                className="btn"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busy}
                form="guest-review-form"
              >
                {busy
                  ? "Saving decision…"
                  : "Confirm " +
                    (action === "create"
                      ? "creation"
                      : action === "link"
                        ? "link"
                        : "rejection")}
              </button>
            </>
          }
        >
          <form id="guest-review-form" onSubmit={review}>
            {action === "create" ? (
              <p>
                A visitor record will be created for{" "}
                <strong>
                  {guest.other_names} {guest.surname}
                </strong>
                . Its six permission choices will match this submitted card.
              </p>
            ) : action === "link" ? (
              <>
                <p>
                  This visit will be attached to{" "}
                  <strong>
                    {match?.first} {match?.last}
                  </strong>
                  . Existing contact details, milestones and permission choices
                  will remain as recorded.
                </p>
                <label className="care-consent-choice mt">
                  <strong>
                    I checked the identity and this is the same person.
                  </strong>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                </label>
              </>
            ) : (
              <p>
                The card will remain in rejected submissions. No member will be
                created.
              </p>
            )}
            <div className="field mt">
              <label htmlFor="guest-review-notes">
                {action === "reject"
                  ? "Reason for rejection *"
                  : "Review note · Optional"}
              </label>
              <textarea
                id="guest-review-notes"
                value={notes}
                maxLength={2000}
                rows={4}
                disabled={busy}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {error && (
              <div className="notice red mt" role="alert">
                {error}
                <p className="mt">
                  Your decision is kept. Retry the same decision, or close this
                  dialog and reload the saved card to check its current status.
                </p>
              </div>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}
