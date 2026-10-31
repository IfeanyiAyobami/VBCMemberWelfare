import { createRoot } from "react-dom/client";
import JourneyDesk from "@/components/JourneyDesk";
import { installMockApi, ME } from "./mock-api";

declare const __FLYER__: string;

installMockApi(__FLYER__);

// Links to modules that are not part of this demo stay on the page.
document.addEventListener(
  "click",
  (e) => {
    const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (href.startsWith("/") && !href.startsWith("//")) {
      e.preventDefault();
      const note = document.getElementById("demo-note");
      if (note) {
        note.textContent =
          "That link opens another module (Church Office, Guests or Home Cell), which is not part of this demo.";
        note.hidden = false;
        clearTimeout((note as any)._t);
        (note as any)._t = setTimeout(() => (note.hidden = true), 4000);
      }
    }
  },
  true,
);

createRoot(document.getElementById("root")!).render(
  <JourneyDesk
    staff={{
      user_id: ME,
      display_name: "Grace Adebayo",
      role: "administrator",
    } as any}
  />,
);
