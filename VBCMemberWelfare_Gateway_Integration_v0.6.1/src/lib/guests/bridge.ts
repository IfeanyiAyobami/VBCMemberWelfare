import { createHmac, timingSafeEqual } from "node:crypto";
/** Server signature, independent of staff cookies. No browser receives this key. */
export function validBridgeSignature(
  raw: string,
  timestamp: string | null,
  signature: string | null,
  secret: string,
  now = Date.now(),
) {
  if (
    !/^[a-f0-9]{64,128}$/i.test(secret) ||
    !timestamp ||
    !/^\d{10}$/.test(timestamp) ||
    !signature ||
    !/^sha256=[a-f0-9]{64}$/.test(signature)
  )
    return false;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp + "." + raw, "utf8")
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
export const WORDPRESS_EVIDENCE =
  "Elementor guest journey v0.6.0. The guest selected visit and follow-up contact permission. Email, SMS, celebrations, programmes and newsletter choices were submitted as separate unchecked-by-default controls. Stored booleans record the selected choices.";
