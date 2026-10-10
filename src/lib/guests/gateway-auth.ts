import { createHash, timingSafeEqual } from "node:crypto";

export function validGatewayToken(
  authorization: string | null,
  expected: string,
) {
  const match = authorization?.match(/^Bearer ([\x21-\x7e]{32,256})$/i);
  // Hash both values to equal-size buffers before constant-time comparison.
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return !!match && timingSafeEqual(digest(match[1]), digest(expected));
}

export function gatewayTokenConfigured(token: string) {
  return /^[\x21-\x7e]{32,256}$/.test(token);
}
