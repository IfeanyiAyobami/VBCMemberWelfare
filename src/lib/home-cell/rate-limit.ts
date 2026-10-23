import 'server-only';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { authJSON } from '@/lib/auth/http';
import { adminDb } from '@/lib/home-cell/admin';
/** Database-backed across Netlify instances. Never trust caller-supplied forwarded IPs. */
export async function authRateLimit(request: Request, operation: 'login' | 'recover', identity?: string) {
  const secret = process.env.HCO_RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return authJSON({ message: 'Sign-in protection is unavailable.' }, 503);
  const ip = process.env.NETLIFY === 'true' ? request.headers.get('x-nf-client-connection-ip')?.trim() : undefined;
  const address = ip && isIP(ip) ? ip : 'shared-unknown';
  const policies: [string, number][] = identity ? [] : [[`ip:${address}`, operation === 'login' ? 60 : 15]];
  if (identity) policies.push([`account:${identity.trim().toLowerCase()}`, operation === 'login' ? 10 : 3]);
  try {
    const db = adminDb();
    for (const [key, limit] of policies) {
      const bucket = createHmac('sha256', secret).update(`${operation}:${key}`).digest('hex');
      const { data, error } = await db.rpc('hco_rate_limit', { p_bucket: bucket, p_limit: limit, p_window: 300 });
      if (error || !data || typeof data.allowed !== 'boolean') throw new Error('RATE_LIMIT_UNAVAILABLE');
      if (!data.allowed) {
        const response = authJSON({ message: 'Too many attempts. Please try again later.' }, 429);
        response.headers.set('Retry-After', String(Math.min(300, Math.max(1, Number(data.retry_after) || 300))));
        return response;
      }
    }
    return null;
  } catch {
    console.error(JSON.stringify({ event: 'hco_rate_limit_unavailable', operation }));
    return authJSON({ message: 'Sign-in protection is unavailable. Please try again later.' }, 503);
  }
}
