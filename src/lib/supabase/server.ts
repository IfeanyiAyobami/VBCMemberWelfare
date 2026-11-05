import { LOGIN_PREFERENCE, sessionCookieOptions } from "@/lib/auth/persistence";
import { boundedFetch } from "@/lib/reliability/fetch";
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/auth/config";

export async function createClient(preference?: { remember: boolean }) {
  const config = getSupabaseConfig();
  if (!config.ready) throw new Error(config.message);
  const cookieStore = await cookies();
  const remember =
    preference?.remember ?? cookieStore.get(LOGIN_PREFERENCE)?.value !== "0";
  return createServerClient(config.url, config.key, {
    // This stage uses same-origin server endpoints, not a browser Supabase client.
    global: { fetch: boundedFetch },
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(
              name,
              value,
              sessionCookieOptions(options, remember),
            ),
          );
        } catch {
          // Server Components cannot write cookies; src/proxy.ts refreshes them first.
        }
      },
    },
  });
}
