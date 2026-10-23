import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { authJSON, preventCaching } from '@/lib/auth/http';
import { PayloadError, readJson } from '@/lib/reliability/json';
/** Logs fixed route labels only. Never log queries, bodies, credentials or identities. */
export function withRoute(label: string, method: string, handler: (request: NextRequest) => Promise<Response>) {
  return async (request: NextRequest) => {
    const id = randomUUID(), start = performance.now();
    let response: Response;
    try {
      if (method === 'POST' && !['login', 'recover'].includes(label)) {
        const body = await readJson(request, 307_200);
        request = new NextRequest(request.url, { method, headers: request.headers, body: JSON.stringify(body), signal: request.signal });
      }
      response = await handler(request);
    } catch (error) {
      response = error instanceof PayloadError
        ? authJSON({ message: error.message }, error.status)
        : authJSON({ message: 'Request unavailable. Please try again later.' }, 503);
    }
    response.headers.set('X-Request-ID', id);
    preventCaching(response);
    console.info(JSON.stringify({ event: 'hco_request', request_id: id, route: label, method, status: response.status, duration_ms: Math.round(performance.now() - start) }));
    return response;
  };
}
