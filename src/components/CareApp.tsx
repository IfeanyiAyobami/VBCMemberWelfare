"use client";

import { useEffect, useRef } from "react";
import { mountCareUI } from "@/lib/care-runtime.js";
import { shellMarkup } from "@/lib/shell-markup.js";

/** React owns mounting and cleanup; the reviewed UI renderer owns the shell. */
export default function CareApp() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root.current) return;
    return mountCareUI(root.current);
  }, []);

  return (
    <div
      ref={root}
      id="care-app"
      dangerouslySetInnerHTML={{ __html: shellMarkup }}
    />
  );
}
