/** Bounded Supabase calls. Writes are never automatically replayed. */
export function createBoundedFetch(transport: typeof fetch, timeoutMs = 8000) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const safe = method === 'GET' || method === 'HEAD';
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    for (let attempt = 0; ; attempt++) {
      const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(callerSignal ? [callerSignal] : [])]);
      try {
        const response = await transport(input, { ...init, signal });
        if (!safe || attempt > 0 || ![502, 503, 504].includes(response.status)) return response;
        await response.body?.cancel();
      } catch (error) {
        if (!safe || attempt > 0 || callerSignal?.aborted) throw error;
      }
      // One short jittered backoff. Rate-limit responses are returned to callers.
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(done, 100 + Math.random() * 150);
        function done() { callerSignal?.removeEventListener('abort', abort); resolve(); }
        function abort() { clearTimeout(timer); callerSignal?.removeEventListener('abort', abort); reject(callerSignal?.reason); }
        if (callerSignal?.aborted) abort();
        else callerSignal?.addEventListener('abort', abort, { once: true });
      });
    }
  };
}
export const boundedFetch: typeof fetch = createBoundedFetch((input, init) => fetch(input, init));
