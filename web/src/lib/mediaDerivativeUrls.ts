/**
 * К производным URL нашего pipeline (.../stem.webp ↔ stem_thumb.webp | stem.avif).
 * Совместимо со старыми путями (.jpg/.png без суффикса) → возвращает null.
 */
export function primaryImageThumbUrl(primaryUrl: string): string | null {
  const raw = String(primaryUrl ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const p = u.pathname;
    if (!/\.webp$/i.test(p)) return null;
    const nextPath = p.replace(/\.webp$/i, "_thumb.webp");
    if (nextPath === p) return null;
    return `${u.origin}${nextPath}`;
  } catch {
    return null;
  }
}

/** AVIF-брат рядом с основным `.webp`. */
export function primaryImageAvifUrl(primaryUrl: string): string | null {
  const raw = String(primaryUrl ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const p = u.pathname;
    if (!/\.webp$/i.test(p)) return null;
    const nextPath = p.replace(/\.webp$/i, ".avif");
    if (nextPath === p) return null;
    return `${u.origin}${nextPath}`;
  } catch {
    return null;
  }
}
