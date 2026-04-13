/** Profile phone: E.164-style, not used for login. */
export function isValidProfilePhone(raw: string): boolean {
  const s = raw.trim();
  if (!s.startsWith("+")) return false;
  const digits = s.slice(1).replace(/\D/g, "");
  return digits.length >= 10;
}

export function normalizeProfilePhone(raw: string): string | null {
  const s = raw.trim();
  if (!s.startsWith("+")) return null;
  const rest = s.slice(1).replace(/\D/g, "");
  if (rest.length < 10) return null;
  return `+${rest}`;
}
