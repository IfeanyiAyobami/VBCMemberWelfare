"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { JourneyPerson } from "@/lib/journey/model";

type Command = {
  id: string;
  group: "People" | "Go to";
  label: string;
  hint?: string;
  run: () => void;
};

/**
 * Keyboard-first search across people and sections.
 * Opens with "/" or Ctrl/⌘+K. Uses the existing /api/journey search,
 * so it only returns people the signed-in staff member may see.
 */
export default function CommandPalette({
  open,
  onClose,
  onPerson,
  sections,
}: {
  open: boolean;
  onClose: () => void;
  onPerson: (id: string) => void;
  sections: { key: string; label: string; go: () => void }[];
}) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<JourneyPerson[]>([]);
  const [resolvedQuery, setResolvedQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      node.showModal();
      setQuery("");
      setPeople([]);
      setResolvedQuery("");
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
    if (!open && node.open) node.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setPeople([]);
      setSearching(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          search: term,
          page: "0",
          view: "all",
          stage: "all",
        });
        const r = await fetch("/api/journey?" + params, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (!r.ok) throw Error();
        const value = await r.json();
        if (controller.signal.aborted) return;
        setPeople((value.items || []).slice(0, 6));
        setResolvedQuery(term);
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) {
          setPeople([]);
          setFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 220);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  const commands = useMemo<Command[]>(() => {
    const term = query.trim().toLowerCase();
    const found: Command[] = (resolvedQuery === query.trim() ? people : []).map(
      (p) => ({
        id: "p-" + p.member_id,
        group: "People",
        label: p.name,
        hint:
          p.status === "member"
            ? "Member"
            : p.next_due && Date.parse(p.next_due) < Date.now()
              ? "Overdue for contact"
              : "Visitor",
        run: () => onPerson(p.member_id),
      }),
    );
    const nav: Command[] = sections
      .filter((s) => !term || s.label.toLowerCase().includes(term))
      .map((s) => ({
        id: "s-" + s.key,
        group: "Go to",
        label: s.label,
        run: s.go,
      }));
    return [...found, ...nav];
  }, [people, resolvedQuery, sections, query, onPerson]);

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(commands.length - 1, 0)));
  }, [commands.length]);

  useEffect(() => {
    if (!open || !commands[active]) return;
    document
      .getElementById(listId + "-" + commands[active].id)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, commands, listId, open]);

  function choose(c?: Command) {
    if (!c) return;
    onClose();
    c.run();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (commands.length ? (i + 1) % commands.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) =>
        commands.length ? (i - 1 + commands.length) % commands.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(commands[active]);
    }
  }

  let lastGroup = "";
  return (
    <dialog
      ref={dialog}
      className="vj-palette"
      aria-label="Find a person or section"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="vj-palette-field">
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 6 6" />
        </svg>
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={
            commands[active] ? listId + "-" + commands[active].id : undefined
          }
          aria-label="Search people or sections"
          placeholder="Search people by name, or jump to a section"
          value={query}
          maxLength={120}
          onChange={(e) => {
            setPeople([]);
            setResolvedQuery("");
            setFailed(false);
            setSearching(e.target.value.trim().length >= 2);
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
        <kbd>Esc</kbd>
      </div>
      <ul id={listId} role="listbox" className="vj-palette-list">
        {commands.map((c, i) => {
          const heading = c.group !== lastGroup ? c.group : "";
          lastGroup = c.group;
          return (
            <li key={c.id} role="presentation">
              {heading && (
                <span className="vj-palette-group" aria-hidden="true">
                  {heading}
                </span>
              )}
              <button
                type="button"
                id={listId + "-" + c.id}
                role="option"
                aria-selected={i === active}
                className={i === active ? "is-active" : ""}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
              >
                <span>{c.label}</span>
                {c.hint && <small>{c.hint}</small>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="vj-palette-foot" aria-live="polite">
        {searching
          ? "Searching…"
          : failed
            ? "Search is unavailable right now. Sections still work."
            : query.trim().length >= 2 && !people.length
              ? "No people match. Check the spelling or try a surname."
              : "↑ ↓ to move · Enter to open · type two letters to search people"}
      </p>
    </dialog>
  );
}
