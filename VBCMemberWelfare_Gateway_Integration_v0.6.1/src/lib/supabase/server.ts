import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/auth/config";

export async function createClient() {
  const config = getSupabaseConfig();
  if (!config.ready) throw new Error(config.message);
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    // This stage uses same-origin server endpoints, not a browser Supabase client.
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
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies; src/proxy.ts refreshes them first.
        }
      },
    },
  });
}
