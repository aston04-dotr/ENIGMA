/**
 * Собрать публичный URL на сайт (без supabase.co) из action_link, который возвращает admin.generateLink.
 * В query у Supabase — одноразовый `token` и `type`; JWT access_token в письмо вставлять нельзя.
 * `email` опционально: часть GoTrue-флоу ожидает email в паре с token.
 */
export function buildEnigmaConfirmUrlFromActionLink(
  supabaseActionLink: string,
  siteOrigin: string,
  userEmail?: string,
): string | null {
  try {
    const u = new URL(supabaseActionLink);
    const token = u.searchParams.get("token");
    if (!token) return null;
    const type = u.searchParams.get("type") || "magiclink";
    const base = siteOrigin.replace(/\/+$/, "");
    const out = new URL("/auth/confirm", base);
    out.searchParams.set("token", token);
    out.searchParams.set("type", type);
    if (userEmail) {
      out.searchParams.set("email", userEmail);
    }
    return out.toString();
  } catch {
    return null;
  }
}
