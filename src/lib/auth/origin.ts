/** Use a deployment-controlled public origin, never arbitrary forwarded headers. */
export function publicOrigin(requestOrigin: string, env: Record<string, string | undefined> = process.env): string | null {
  const configured = env.APP_ORIGIN?.trim() || (env.NETLIFY === 'true'
    ? (env.CONTEXT === 'production' ? env.URL : env.DEPLOY_PRIME_URL || env.URL)
    : undefined);
  const value = configured || requestOrigin;
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin;
  } catch { return null; }
}
export function acceptsOrigin(origin: string | null, requestOrigin: string, env: Record<string, string | undefined> = process.env): boolean {
  return !!origin && origin === publicOrigin(requestOrigin, env);
}
