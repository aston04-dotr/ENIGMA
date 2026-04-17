import { supabase } from "./supabase";
import { buildApiUrl } from "./runtimeConfig";

/**
 * Magic link only — шаблон письма в Supabase: ссылка, не OTP.
 * Redirect URLs: production origin, /auth/callback, и при необходимости exp://…
 */
export async function signIn(email: string) {
  const trimmed = email.trim().toLowerCase();
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), 12000);

  try {
    const res = await fetch(buildApiUrl("/api/auth/magic-link"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
      signal: controller?.signal,
    });

    let payload: { ok?: boolean; error?: string } = {};
    try {
      payload = (await res.json()) as { ok?: boolean; error?: string };
    } catch {
      /* ignore json parse */
    }

    if (!res.ok || payload.ok === false) {
      return { error: { message: payload.error || "Не удалось отправить ссылку. Попробуйте ещё раз." } };
    }

    return { error: null };
  } catch (e) {
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "Превышено время ожидания. Проверьте интернет и повторите."
        : "Не удалось отправить ссылку. Проверьте интернет и повторите.";
    return { error: { message: msg } };
  } finally {
    clearTimeout(timeout);
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
