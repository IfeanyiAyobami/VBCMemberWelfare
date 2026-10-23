export class PayloadError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
/** Enforces bytes while streaming; Content-Length alone is not trustworthy. */
export async function readJson(request: Request, maxBytes = 16_384): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new PayloadError(415, 'Send JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new PayloadError(400, 'Enter the request details.');
  let size = 0, text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new PayloadError(413, 'Request is too large.'); }
      text += decoder.decode(value, { stream: true });
    }
    const data = JSON.parse(text + decoder.decode());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch (error) {
    if (error instanceof PayloadError) throw error;
    throw new PayloadError(400, 'Invalid JSON request.');
  } finally { reader.releaseLock(); }
}
