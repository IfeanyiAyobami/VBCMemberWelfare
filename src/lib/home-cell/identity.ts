/** Local Nigerian numbers and explicit international E.164 numbers. */
export function normalizeLoginPhone(value: string): string | null {
  const s = value.trim().replace(/[\s().-]/g, "");
  if (/^0[789]\d{9}$/.test(s)) return "+234" + s.slice(1);
  if (/^234[789]\d{9}$/.test(s)) return "+" + s;
  if (s.startsWith("+234") && !/^\+234[789]\d{9}$/.test(s)) return null;
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;
  return null;
}
export function loginIdentity(value: string) {
  const s = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254)
    return { email: s.toLowerCase() };
  const phone = normalizeLoginPhone(s);
  return phone ? { phone } : null;
}
