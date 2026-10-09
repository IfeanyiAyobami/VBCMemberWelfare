/** Only the display preference is stored; member records remain in memory. */
export const THEME_STORAGE_KEY = "vbc-care-theme";

// Runs before first paint in Next.js and in the standalone HTML export.
export const themeBootstrap = `(() => {
  let theme = 'dark';
  try {
    const saved = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch {}
  document.documentElement.setAttribute('data-theme', theme);
})();`;

export function mountThemeToggle(root) {
  const button = root.querySelector("#theme-toggle");
  if (!button) return () => {};

  const sun =
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  const moon = '<path d="M20.9 13.2A9 9 0 0 1 10.8 3.1 9 9 0 1 0 20.9 13.2Z"/>';

  function sync() {
    const dark =
      document.documentElement.getAttribute("data-theme") !== "light";
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute("title", label);
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${dark ? sun : moon}</svg><span>${dark ? "Light mode" : "Dark mode"}</span>`;
  }

  function toggle() {
    const theme =
      document.documentElement.getAttribute("data-theme") === "light"
        ? "dark"
        : "light";
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
    sync();
  }

  function storageChanged(event) {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    const theme = event.newValue === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    sync();
  }

  if (!document.documentElement.hasAttribute("data-theme")) {
    let theme = "dark";
    try {
      if (localStorage.getItem(THEME_STORAGE_KEY) === "light") theme = "light";
    } catch {}
    document.documentElement.setAttribute("data-theme", theme);
  }
  sync();
  button.addEventListener("click", toggle);
  window.addEventListener("storage", storageChanged);
  return () => {
    button.removeEventListener("click", toggle);
    window.removeEventListener("storage", storageChanged);
  };
}
