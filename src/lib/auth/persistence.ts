export const LOGIN_PREFERENCE = "vbc-remember-session";
export const REMEMBER_SECONDS = 60 * 60 * 24 * 30;
/** Refreshes must preserve a session-only login, including chunked Supabase cookies. */
export function sessionCookieOptions<
  T extends { maxAge?: number; expires?: Date | string },
>(options: T, remember: boolean): T {
  if (options.maxAge !== undefined && options.maxAge <= 0) return options;
  const result = { ...options };
  delete result.expires;
  if (remember) result.maxAge = REMEMBER_SECONDS;
  else delete result.maxAge;
  return result;
}
