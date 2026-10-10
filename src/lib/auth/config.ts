import "server-only";

export function getSupabaseConfig():
  | { ready: true; url: string; key: string }
  | { ready: false; message: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) {
    return {
      ready: false,
      message:
        "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the app.",
    };
  }
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (
      (parsed.protocol !== "https:" &&
        !(local && parsed.protocol === "http:")) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname !== "/" && parsed.pathname !== "")
    )
      throw new Error();
  } catch {
    return {
      ready: false,
      message:
        "Check NEXT_PUBLIC_SUPABASE_URL. Use the Project URL from the Supabase Connect panel.",
    };
  }
  let allowed = key.startsWith("sb_publishable_") && key.length > 20;
  if (key.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString("utf8"),
      );
      allowed = payload.role === "anon";
    } catch {
      allowed = false;
    }
  }
  if (!allowed) {
    return {
      ready: false,
      message:
        "Use the Supabase publishable key in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. A secret or service_role key cannot be used here.",
    };
  }
  return { ready: true, url, key };
}
