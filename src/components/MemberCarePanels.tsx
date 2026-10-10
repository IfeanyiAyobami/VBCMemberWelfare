"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { MemberRecord } from "@/lib/members/model";
import {
  PREFERENCE_LABELS,
  validEvidence,
  validNote,
  type Preferences,
  type CareNote,
  type ConsentEvent,
  type CarePage,
} from "@/lib/members/care-model";
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
function timeLabel(value: string) {
  return (
    new Date(value).toLocaleString("en-GB", {
      timeZone: "Africa/Lagos",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " · Lagos"
  );
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "We could not save this change. Check your connection and try again.";
}

export default function MemberCarePanels({
  member,
  canEdit,
  request,
  onChanged,
}: {
  member: MemberRecord;
  canEdit: boolean;
  request: Request;
  onChanged: (message: string, record?: MemberRecord) => void;
}) {
  const [modal, setModal] = useState<"consent" | "archive" | null>(null);
  const [note, setNote] = useState(""),
    [noteError, setNoteError] = useState(""),
    [notePending, setNotePending] = useState(false),
    [noteSaved, setNoteSaved] = useState("");
  const noteId = useRef("");
  const [notesPage, setNotesPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [notes, setNotes] = useState<CarePage<CareNote> | null>(null),
    [events, setEvents] = useState<CarePage<ConsentEvent> | null>(null);
  const [notesError, setNotesError] = useState(""),
    [historyError, setHistoryError] = useState(""),
    [historyOpen, setHistoryOpen] = useState(false);
  const editable = canEdit && !member.archivedAt;
  useEffect(() => {
    noteId.current = crypto.randomUUID();
  }, []);
  useEffect(() => {
    if (!canEdit) setModal(null);
  }, [canEdit]);
  useEffect(() => {
    const controller = new AbortController();
    setNotes(null);
    setNotesError("");
    void request<CarePage<CareNote>>(
      `/api/members/${member.id}/notes?page=${notesPage}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setNotes(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setNotesError(errorMessage(error));
      });
    return () => controller.abort();
  }, [member.id, notesPage, revision, request]);
  useEffect(() => {
    if (!historyOpen) return;
    const controller = new AbortController();
    setEvents(null);
    setHistoryError("");
    void request<CarePage<ConsentEvent>>(
      `/api/members/${member.id}/preferences?page=${historyPage}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setEvents(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setHistoryError(errorMessage(error));
      });
    return () => controller.abort();
  }, [
    member.id,
    member.preferenceVersion,
    historyOpen,
    historyPage,
    revision,
    request,
  ]);
  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (notePending) return;
    setNoteError("");
    setNoteSaved("");
    if (!validNote(note)) {
      setNoteError("Enter a care note of 1–4000 characters.");
      return;
    }
    setNotePending(true);
    try {
      await request(`/api/members/${member.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: note, requestId: noteId.current }),
      });
      setNote("");
      noteId.current = crypto.randomUUID();
      setNotesPage(1);
      setRevision((v) => v + 1);
      setNoteSaved("Care note saved.");
    } catch (error) {
      setNoteError(errorMessage(error));
    } finally {
      setNotePending(false);
    }
  }
  return (
    <>
      {member.archivedAt && (
        <div className="notice mb" role="status">
          <strong>Archived {timeLabel(member.archivedAt)}.</strong>
          <p className="mt">
            This record is outside the active directory. Its notes and
            preferences are retained; scheduled sending excludes archived
            members.
          </p>
        </div>
      )}
      <div className="grid two member-care-grid">
        <section className="card" aria-label="Message preferences">
          <div className="card-head">
            <h2>Message preferences</h2>
            {editable ? (
              <button
                type="button"
                className="btn small"
                disabled={!member.preferenceVersion}
                onClick={() => setModal("consent")}
              >
                Edit permissions
              </button>
            ) : (
              <span className="badge blue">View only</span>
            )}
          </div>
          <div className="card-pad">
            {Object.entries(PREFERENCE_LABELS).map(([key, label]) => (
              <div className="settings-row" key={key}>
                <strong>{label}</strong>
                <span
                  className={
                    "badge " +
                    (member.preferences[key as keyof Preferences]
                      ? "green"
                      : "blue")
                  }
                >
                  {member.preferences[key as keyof Preferences]
                    ? "Recorded"
                    : "Off"}
                </span>
              </div>
            ))}
            <p className="help-text">
              Follow-up contact, each channel and each topic are separate
              choices. A greeting or newsletter needs contact permission, its
              channel and its topic. Sending remains paused.
            </p>
            {member.preferenceEvidence && (
              <div className="care-evidence">
                <strong>Latest evidence · {member.preferencePolicy}</strong>
                <p>{member.preferenceEvidence}</p>
                <small>
                  {member.preferenceVersion &&
                    timeLabel(member.preferenceVersion)}
                </small>
              </div>
            )}
            <button
              type="button"
              className="text-link care-history-toggle"
              aria-expanded={historyOpen}
              aria-controls="consent-history"
              onClick={() => setHistoryOpen((v) => !v)}
            >
              {historyOpen ? "Hide" : "View"} permission history
            </button>
            {historyOpen && (
              <div id="consent-history" className="mt">
                {historyError ? (
                  <LoadError
                    message={historyError}
                    retry={() => setRevision((v) => v + 1)}
                  />
                ) : !events ? (
                  <p role="status">Loading permission history…</p>
                ) : (
                  <>
                    {!events.items.length && (
                      <p className="hint">
                        No permission changes have been recorded.
                      </p>
                    )}
                    <ol className="care-history">
                      {events.items.map((event) => (
                        <li key={event.id}>
                          <div className="care-note-heading">
                            <strong>
                              {PREFERENCE_LABELS[event.preference] ||
                                event.preference}
                            </strong>
                            <span
                              className={
                                "badge " + (event.new_value ? "green" : "blue")
                              }
                            >
                              {event.previous_value === null
                                ? "Initial"
                                : event.previous_value
                                  ? "On"
                                  : "Off"}{" "}
                              → {event.new_value ? "On" : "Off"}
                            </span>
                          </div>
                          <small>
                            {timeLabel(event.recorded_at)} · {event.author} ·{" "}
                            {event.source} · {event.policy_version}
                          </small>
                          {event.evidence_note && <p>{event.evidence_note}</p>}
                        </li>
                      ))}
                    </ol>
                    <Pager
                      page={events}
                      onPage={setHistoryPage}
                      label="permission history"
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </section>
        <section className="card" aria-label="Care notes">
          <div className="card-head">
            <h2>Care notes</h2>
            <span className="badge blue">Staff only</span>
          </div>
          <div className="card-pad">
            <p className="hint">
              Keep practical follow-up notes for the care team. All active staff
              roles can read them.
            </p>
            {editable && (
              <form className="care-note-form mt" onSubmit={addNote}>
                <label htmlFor="care-note-body">Add a follow-up note</label>
                <textarea
                  id="care-note-body"
                  rows={4}
                  maxLength={4000}
                  disabled={notePending}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What happened, and what should the team do next?"
                  aria-describedby="care-note-help"
                />
                <small id="care-note-help">
                  Saved notes stay in the record. Add a correction as a new
                  note.
                </small>
                {noteError && (
                  <div className="notice red mt" role="alert">
                    {noteError}
                  </div>
                )}
                {noteSaved && (
                  <p className="care-success" role="status">
                    {noteSaved}
                  </p>
                )}
                <div className="care-note-actions">
                  <small>{note.length}/4000</small>
                  <button
                    className="btn primary"
                    type="submit"
                    disabled={notePending}
                  >
                    {notePending ? "Saving…" : "Save care note"}
                  </button>
                </div>
              </form>
            )}
            <div className="mt">
              {notesError ? (
                <LoadError
                  message={notesError}
                  retry={() => setRevision((v) => v + 1)}
                />
              ) : !notes ? (
                <p role="status">Loading care notes…</p>
              ) : (
                <>
                  {!notes.items.length && (
                    <div className="care-empty">
                      <strong>A thoughtful follow-up starts here.</strong>
                      <p className="hint mt">No care notes yet.</p>
                    </div>
                  )}
                  <ol className="care-notes">
                    {notes.items.map((note) => (
                      <li key={note.id}>
                        <div className="care-note-heading">
                          <strong>{note.author}</strong>
                          <small>{timeLabel(note.created_at)}</small>
                        </div>
                        <p>{note.body}</p>
                      </li>
                    ))}
                  </ol>
                  <Pager
                    page={notes}
                    onPage={setNotesPage}
                    label="care notes"
                  />
                </>
              )}
            </div>
          </div>
        </section>
      </div>
      <section className="card mt care-record-status">
        <div>
          <h2>{member.archivedAt ? "Restore this record" : "Record status"}</h2>
          <p className="hint mt">
            {member.archivedAt
              ? "Return this person to the active directory. Review the retained permissions before future messaging."
              : "Archive a record when it should leave the active directory. You can restore it later; its details and notes remain saved."}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="btn"
            onClick={() => setModal("archive")}
          >
            {member.archivedAt ? "Restore member" : "Archive member"}
          </button>
        )}
      </section>
      {modal === "consent" && editable && (
        <ConsentEditor
          member={member}
          request={request}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            onChanged("Permissions saved. Messaging remains paused.");
          }}
        />
      )}
      {modal === "archive" && canEdit && (
        <ArchiveEditor
          member={member}
          request={request}
          onClose={() => setModal(null)}
          onSaved={(record) => {
            setModal(null);
            onChanged(
              record.archivedAt
                ? "Member archived. Details and notes are retained."
                : "Member restored to the active directory.",
              record,
            );
          }}
        />
      )}
    </>
  );
}
function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="notice red">
      <p>{message}</p>
      <button type="button" className="btn small mt" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
function Pager({
  page,
  onPage,
  label,
}: {
  page: CarePage<unknown>;
  onPage: (n: number) => void;
  label: string;
}) {
  return page.total > page.pageSize ? (
    <nav className="care-pager" aria-label={label + " pages"}>
      <button
        type="button"
        className="btn small"
        disabled={page.page <= 1}
        onClick={() => onPage(page.page - 1)}
      >
        Previous
      </button>
      <small>
        Page {page.page} of {Math.ceil(page.total / page.pageSize)}
      </small>
      <button
        type="button"
        className="btn small"
        disabled={page.page * page.pageSize >= page.total}
        onClick={() => onPage(page.page + 1)}
      >
        Next
      </button>
    </nav>
  ) : null;
}
function CareDialog({
  title,
  pending,
  onClose,
  children,
  footer,
}: {
  title: string;
  pending: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal member-editor care-dialog"
      aria-labelledby="care-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <div className="eyebrow">Member care</div>
          <h2 id="care-dialog-title">{title}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close form"
          disabled={pending}
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
function ConsentEditor({
  member,
  request,
  onClose,
  onSaved,
}: {
  member: MemberRecord;
  request: Request;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [choices, setChoices] = useState<Preferences>({
      ...member.preferences,
    }),
    [evidence, setEvidence] = useState("");
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);
  const changed = Object.keys(PREFERENCE_LABELS).some(
    (key) =>
      choices[key as keyof Preferences] !==
      member.preferences[key as keyof Preferences],
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    if (!validEvidence(evidence)) {
      setError(
        "Record how and when permission was given or withdrawn (10–2000 characters).",
      );
      return;
    }
    if (!changed) {
      setError("Change at least one permission before saving.");
      return;
    }
    setPending(true);
    try {
      await request(`/api/members/${member.id}/preferences`, {
        method: "PATCH",
        body: JSON.stringify({
          preferences: choices,
          evidence,
          expectedVersion: member.preferenceVersion,
        }),
      });
      onSaved();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <CareDialog
      title="Record communication permissions"
      pending={pending}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="consent-form"
            className="btn primary"
            disabled={pending}
          >
            {pending ? "Saving…" : "Save permissions"}
          </button>
        </>
      }
    >
      <form id="consent-form" onSubmit={save} noValidate>
        <p className="hint">
          For {member.first} {member.last}. Record the member’s explicit
          choices. A follow-up request does not grant newsletter or SMS
          permission.
        </p>
        {error && (
          <div ref={alert} tabIndex={-1} className="notice red mt" role="alert">
            {error}
          </div>
        )}
        <fieldset disabled={pending} className="care-consent-fields">
          <legend>Contact, channels and topics</legend>
          {Object.entries(PREFERENCE_LABELS).map(([key, label]) => (
            <label className="care-consent-choice" key={key}>
              <span>
                <strong>{label}</strong>
                <small>
                  {key === "contact_consent"
                    ? "Permission for church contact and follow-up"
                    : key === "email_opt_in"
                      ? "Send approved messages by email"
                      : key === "sms_opt_in"
                        ? "Send approved messages by text"
                        : key === "newsletters_opt_in"
                          ? "Receive the monthly church newsletter"
                          : key === "programmes_opt_in"
                            ? "Receive special programme invitations"
                            : "Receive birthday and anniversary greetings"}
                </small>
              </span>
              <input
                type="checkbox"
                checked={choices[key as keyof Preferences]}
                onChange={(event) =>
                  setChoices({ ...choices, [key]: event.target.checked })
                }
              />
            </label>
          ))}
          <label htmlFor="consent-evidence" className="mt">
            Evidence of permission <span className="required">*</span>
          </label>
          <textarea
            id="consent-evidence"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            placeholder="Date, how the member gave or withdrew permission, and which choices they confirmed."
          />
          <p className="help-text">
            This note and each changed choice are saved in the permission
            history. Sending remains paused.
          </p>
        </fieldset>
      </form>
    </CareDialog>
  );
}
function ArchiveEditor({
  member,
  request,
  onClose,
  onSaved,
}: {
  member: MemberRecord;
  request: Request;
  onClose: () => void;
  onSaved: (record: MemberRecord) => void;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const restoring = !!member.archivedAt;
  async function save() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const data = await request<{ member: MemberRecord }>(
        `/api/members/${member.id}/archive`,
        {
          method: "PATCH",
          body: JSON.stringify({
            archived: !restoring,
            expectedVersion: member.version,
          }),
        },
      );
      onSaved(data.member);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <CareDialog
      title={restoring ? "Restore this member?" : "Archive this member?"}
      pending={pending}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={pending}
            onClick={() => void save()}
          >
            {pending
              ? "Saving…"
              : restoring
                ? "Confirm restore"
                : "Confirm archive"}
          </button>
        </>
      }
    >
      <p>
        <strong>
          {member.first} {member.last}
        </strong>
      </p>
      <p className="hint mt">
        {restoring
          ? "This record will return to the active directory with its existing details, notes and permissions. Check the retained permissions before messaging is enabled."
          : "This record will leave the active directory and be excluded from scheduled sending. Details, notes and permissions stay saved. You can restore it from the Archived members view."}
      </p>
      {error && (
        <div className="notice red mt" role="alert">
          {error}
        </div>
      )}
    </CareDialog>
  );
}
