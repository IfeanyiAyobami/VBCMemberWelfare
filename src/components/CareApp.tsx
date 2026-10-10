"use client";

import { useEffect, useRef } from "react";
import { mountCareUI } from "@/lib/care-runtime.js";
import { shellMarkup } from "@/lib/shell-markup.js";
import type { StaffIdentity } from "@/lib/auth/types";
import { isMemberId } from "@/lib/members/model";

/** The reviewed UI remains a simulation; staff authentication is real. */
export default function CareApp({ staff }: { staff: StaffIdentity }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) return;
    const node = root.current;
    let disposed = false;
    let checking: Promise<boolean> | null = null;
    let signingOut = false;
    let notice: HTMLElement | null = null;
    const roleLabel = {
      administrator: "Administrator",
      editor: "Editor",
      viewer: "Viewer",
      followup_worker: "Follow-up Worker",
    };

    function showIdentity(identity: StaffIdentity) {
      const user = node.querySelector(".office-user");
      if (!user) return;
      const initials = identity.display_name
        .split(/\s+/)
        .slice(0, 2)
        .map((n) => n[0] || "")
        .join("")
        .toUpperCase();
      user.replaceChildren();
      const avatar = document.createElement("span");
      avatar.className = "avatar small";
      avatar.textContent = initials;
      const name = document.createElement("span");
      name.className = "staff-name";
      name.textContent = identity.display_name;
      const role = document.createElement("small");
      role.textContent = roleLabel[identity.role] + " · Signed in";
      name.append(role);
      const logout = document.createElement("button");
      logout.type = "button";
      logout.className = "staff-logout";
      logout.dataset.careLogout = "";
      logout.textContent = "Sign out";
      logout.setAttribute("aria-label", "Sign out of the care dashboard");
      user.append(avatar, name, logout);
      const topAvatar = node.querySelector(".top-actions .avatar");
      if (topAvatar) topAvatar.textContent = initials;
    }
    function blockUntilVerified() {
      node.inert = true;
      node.style.visibility = "hidden";
      if (notice) return;
      notice = document.createElement("div");
      notice.className = "care-session-notice";
      notice.setAttribute("role", "alert");
      notice.textContent =
        "We cannot verify staff access right now. Check your connection and refresh this page.";
      node.before(notice);
    }
    function endSession() {
      node.replaceChildren();
      window.location.replace(
        "/access?reason=expired&next=" +
          encodeURIComponent(window.location.pathname),
      );
    }
    async function verifySession(): Promise<boolean> {
      if (disposed || signingOut) return false;
      if (checking) return checking;
      checking = (async () => {
        try {
          const response = await fetch("/api/auth/session", {
            credentials: "same-origin",
            cache: "no-store",
          });
          if (disposed || signingOut) return false;
          if (response.status === 401 || response.status === 403) {
            endSession();
            return false;
          }
          if (!response.ok) {
            blockUntilVerified();
            return false;
          }
          const data = await response.json();
          if (data.staff?.user_id !== staff.user_id) {
            node.replaceChildren();
            window.location.reload();
            return false;
          }
          notice?.remove();
          notice = null;
          node.inert = false;
          node.style.visibility = "";
          showIdentity(data.staff);
          return true;
        } catch {
          if (!disposed) blockUntilVerified();
          return false;
        } finally {
          checking = null;
        }
      })();
      return checking;
    }
    const disposeUI = mountCareUI(node, {
      beforeNavigate: async (path: string) => {
        if (path === "/access" || path.startsWith("/access/")) {
          window.location.assign(path);
          return false;
        }
        if (
          path.split("?")[0] === "/members" ||
          path === "/guests" ||
          (path.startsWith("/guest/") && isMemberId(path.split("/")[2])) ||
          (path.startsWith("/profile/") && isMemberId(path.split("/")[2]))
        ) {
          window.location.assign(path);
          return false;
        }
        return verifySession();
      },
      openMemberDirectory: () => window.location.assign("/members?add=1"),
      memberDirectorySaved: true,
    });
    showIdentity(staff);
    const bar = node.querySelector(".demo-bar");
    if (bar) {
      const badge = bar.querySelector("span");
      if (badge) badge.textContent = "STAFF LOGIN ACTIVE";
      const text = bar.querySelector("p");
      if (text)
        text.textContent =
          "This screen uses sample records · The Members directory is saved · Messaging is paused";
    }

    async function logout(event: MouseEvent) {
      const button = (event.target as Element).closest<HTMLButtonElement>(
        "[data-care-logout]",
      );
      if (!button || signingOut) return;
      event.preventDefault();
      signingOut = true;
      button.disabled = true;
      button.textContent = "Leaving…";
      try {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) throw new Error();
        node.replaceChildren();
        window.location.replace("/access");
      } catch {
        signingOut = false;
        button.disabled = false;
        button.textContent = "Sign out";
        const toast = node.querySelector("#toast");
        if (toast) {
          toast.textContent =
            "Sign-out could not complete. Check your connection and try again.";
          toast.classList.add("visible");
        }
      }
    }
    const onFocus = () => {
      void verifySession();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void verifySession();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void verifySession();
    }, 60000);
    node.addEventListener("click", logout);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      notice?.remove();
      node.removeEventListener("click", logout);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      disposeUI();
    };
  }, [staff]);

  return (
    <>
    <div
      ref={root}
      id="care-app"
      dangerouslySetInnerHTML={{ __html: shellMarkup }}
    />
    </>
  );
}
