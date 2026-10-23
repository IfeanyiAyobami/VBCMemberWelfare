"use client";
import { useLayoutEffect, useRef, type FormEvent } from "react";
/** In-memory only. Scope keys isolate meeting/cell drafts; no contact data is persisted to storage. */
export function useFormDrafts() {
  const root = useRef<HTMLFieldSetElement>(null);
  const drafts = useRef(new Map<string, Record<string, string | boolean>>());
  function capture(e: FormEvent) {
    const target = e.target;
    if (!(
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ))
      return;
    const form = target.form,
      key = form?.dataset.draftKey;
    if (!form || !key) return;
    const values: Record<string, string | boolean> = {};
    for (const el of Array.from(form.elements)) {
      if (
        !(
          el instanceof HTMLInputElement ||
          el instanceof HTMLSelectElement ||
          el instanceof HTMLTextAreaElement
        ) ||
        !el.name ||
        (el instanceof HTMLInputElement &&
          ["password", "hidden", "file"].includes(el.type))
      )
        continue;
      values[el.name] =
        el instanceof HTMLInputElement && el.type === "checkbox"
          ? el.checked
          : el.value;
    }
    drafts.current.set(key, values);
  }
  useLayoutEffect(() => {
    for (const form of Array.from(
      root.current?.querySelectorAll<HTMLFormElement>("form[data-draft-key]") ||
        [],
    )) {
      const values = drafts.current.get(form.dataset.draftKey!);
      if (!values) continue;
      for (const el of Array.from(form.elements)) {
        if (
          !(
            el instanceof HTMLInputElement ||
            el instanceof HTMLSelectElement ||
            el instanceof HTMLTextAreaElement
          ) ||
          !el.name ||
          !(el.name in values)
        )
          continue;
        const value = values[el.name];
        if (el instanceof HTMLInputElement && el.type === "checkbox")
          el.checked = value === true;
        else if (
          typeof value === "string" &&
          (!(el instanceof HTMLSelectElement) ||
            Array.from(el.options).some((o) => o.value === value))
        )
          el.value = value;
      }
    }
  });
  return { root, capture, clear: (key: string) => drafts.current.delete(key) };
}
