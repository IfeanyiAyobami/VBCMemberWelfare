import { boundedFetch } from "@/lib/reliability/fetch";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/auth/config";
import { preventCaching } from "@/lib/auth/http";

export async function proxy(request: NextRequest) {
  let response = preventCaching(NextResponse.next({ request }));
  const config = getSupabaseConfig();
  if (!config.ready) return response;
  const supabase = createServerClient(config.url, config.key, {
    global: { fetch: boundedFetch },
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
        preventCaching(response);
      },
    },
  });
  try {
    await supabase.auth.getUser();
  } catch {
    /* Page and API guards fail closed. */
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|assets/|api/intake/wordpress|api/integrations/wordpress/first-timers|favicon.ico|robots.txt).*)",
  ],
};
