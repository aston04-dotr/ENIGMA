import { supabase } from "./supabase";

function maskEmailForLog(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}

/**
 * Magic link только через кастомный route `/api/auth/magic-link` (Resend + generateLink).
 * Прямой `supabase.auth.signInWithOtp` на клиенте не используется.
 */
export async function signIn(email: string) {
  const trimmed = email.trim().toLowerCase();
  const label = maskEmailForLog(trimmed);
  console.log("[auth] magic_link:start", { email: label });

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = setTimeout(() => controller?.abort(), 15_000);

  try {
    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
      signal: controller?.signal,
    });

    const raw = await res.text();
    if (res.ok) {
      console.log("[auth] magic_link:ok", { via: "api", email: label });
      return { error: null as null };
    }

    let message = raw || `HTTP ${res.status}`;
    try {
      const payload = JSON.parse(raw) as { error?: string; ok?: boolean };
      if (payload?.error) message = payload.error;
    } catch {
      if (res.status === 400) message = "Некорректный email";
    }
    if (res.status === 400 && !raw) message = "Некорректный email";

    console.warn("[auth] magic_link:api_error", {
      email: label,
      status: res.status,
      message,
    });
    return { error: { message } };
  } catch (e) {
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "Превышено время ожидания. Проверьте интернет и повторите."
        : "Не удалось отправить ссылку. Проверьте интернет и повторите.";
    console.error("[auth] magic_link:error", { email: label, message: msg });
    return { error: { message: msg } };
  } finally {
    clearTimeout(t);
  }
}

export async function signInWithMagicLink(email: string) {
  return signIn(email);
}

export async function getCurrentUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}
