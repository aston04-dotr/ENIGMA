import { supabase } from "./supabase";
import { getSiteOrigin } from "./runtimeConfig";

/**
 * Magic link only — шаблон письма в Supabase: ссылка, не OTP.
 * Redirect URLs: production origin, /auth/callback, и при необходимости exp://…
 */
export async function signIn(email: string) {
  const trimmed = email.trim().toLowerCase();
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), 10_000);
  const withTimeout = async <T>(promise: Promise<T>, ms = 10_000): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("magic_link_direct_timeout")), ms)
      ),
    ]);

  try {
    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
      signal: controller?.signal,
    });

    let payload: { ok?: boolean; error?: string } | null = null;
    try {
      payload = (await res.json()) as { ok?: boolean; error?: string };
    } catch {
      payload = null;
    }

    if (!res.ok || !payload || payload.ok !== true) {
      // Fallback: если API недоступен, пробуем прямой вызов Supabase из браузера.
      const direct = await withTimeout(
        supabase.auth.signInWithOtp({
          email: trimmed,
          options: {
            emailRedirectTo: `${getSiteOrigin()}/auth/callback`,
            shouldCreateUser: true,
          },
        }),
        10_000
      );
      if (!direct.error) {
        return { error: null };
      }
      return { error: { message: payload?.error || direct.error.message || "Не удалось отправить ссылку. Попробуйте ещё раз." } };
    }

    return { error: null };
  } catch (e) {
    try {
      const direct = await withTimeout(
        supabase.auth.signInWithOtp({
          email: trimmed,
          options: {
            emailRedirectTo: `${getSiteOrigin()}/auth/callback`,
            shouldCreateUser: true,
          },
        }),
        10_000
      );
      if (!direct.error) {
        return { error: null };
      }
      return { error: { message: direct.error.message } };
    } catch {
      const msg =
        e instanceof Error && (e.name === "AbortError" || e.message === "magic_link_direct_timeout")
          ? "Превышено время ожидания. Проверьте интернет и повторите."
          : "Не удалось отправить ссылку. Проверьте интернет и повторите.";
      return { error: { message: msg } };
    }
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
