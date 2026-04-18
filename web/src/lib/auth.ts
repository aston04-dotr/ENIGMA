import { supabase } from "./supabase";
import { getSiteOrigin } from "./runtimeConfig";

function maskEmailForLog(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}

/**
 * Magic link only — шаблон письма в Supabase: ссылка, не OTP.
 * Новые пользователи: `shouldCreateUser: true` (аналог signUp по email).
 * Redirect URLs: production origin, /auth/callback, и при необходимости exp://…
 */
export async function signIn(email: string) {
  const trimmed = email.trim().toLowerCase();
  const label = maskEmailForLog(trimmed);
  console.log("[auth] magic_link:start", { email: label });

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), 10_000);
  const withTimeout = async <T>(promise: Promise<T>, ms = 10_000): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("magic_link_direct_timeout")), ms)
      ),
    ]);

  const directOtp = () =>
    supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${getSiteOrigin()}/auth/callback`,
        shouldCreateUser: true,
      },
    });

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

    if (res.ok && payload?.ok === true) {
      console.log("[auth] magic_link:ok", { via: "api", email: label });
      return { error: null };
    }

    console.warn("[auth] magic_link:api_not_ok", {
      email: label,
      status: res.status,
      payload,
    });

    const direct = await withTimeout(directOtp(), 10_000);
    if (!direct.error) {
      console.log("[auth] magic_link:ok", { via: "direct", email: label });
      return { error: null };
    }
    console.error("[auth] magic_link:error", {
      via: "direct",
      email: label,
      message: direct.error.message,
    });
    return {
      error: {
        message: payload?.error || direct.error.message || "Не удалось отправить ссылку. Попробуйте ещё раз.",
      },
    };
  } catch (e) {
    try {
      const direct = await withTimeout(directOtp(), 10_000);
      if (!direct.error) {
        console.log("[auth] magic_link:ok", { via: "direct_after_error", email: label });
        return { error: null };
      }
      console.error("[auth] magic_link:error", {
        via: "direct_after_error",
        email: label,
        message: direct.error.message,
      });
      return { error: { message: direct.error.message } };
    } catch {
      const msg =
        e instanceof Error && (e.name === "AbortError" || e.message === "magic_link_direct_timeout")
          ? "Превышено время ожидания. Проверьте интернет и повторите."
          : "Не удалось отправить ссылку. Проверьте интернет и повторите.";
      console.error("[auth] magic_link:error", { email: label, message: msg, raw: String(e) });
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
