export const careScreens = [
  "overview",
  "members",
  "guests",
  "followups",
  "celebrations",
  "programmes",
  "campaigns",
  "newsletters",
  "templates",
  "automations",
  "delivery",
  "settings",
  "settings/general",
  "settings/providers",
  "settings/team",
  "budget",
  "guide",
  "join",
  "preferences",
  "access",
  "access/recover",
  "import",
  "compose",
] as const;

export function isCareRoute(path: string): boolean {
  return (
    path === "" ||
    (careScreens as readonly string[]).includes(path) ||
    /^(profile|preferences)\/m[a-zA-Z0-9_-]+$/.test(path) ||
    /^(?:profile|guest)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      path,
    ) ||
    /^compose\/c[a-zA-Z0-9_-]+$/.test(path)
  );
}
