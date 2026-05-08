import { isLocalMobileBundleRuntime } from "./mobileRuntime";
import { getRedirectSiteOrigin, getSiteOrigin, getSupabasePublicConfig } from "./runtimeConfig";
import { isSupabaseConfigured, supabase } from "./supabase";

function maskEmailForLog(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}

/**
 * Email OTP через POST `/api/auth/magic-link`: сервер отправляет код на почту.
 */
export async function signIn(email: string) {
  const trimmed = email.trim().toLowerCase();
  const label = maskEmailForLog(trimmed);
  const preferDirectOtp = isLocalMobileBundleRuntime();
  const { configured, url } = getSupabasePublicConfig();
  const supabaseHost = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  })();
  console.log("[auth] magic_link:request_started", {
    email: label,
    mode: preferDirectOtp ? "direct_supabase" : "api_route",
    supabaseConfigured: configured && isSupabaseConfigured,
    supabaseHost,
  });
  const mobileRedirectTo =
    process.env.NEXT_PUBLIC_AUTH_EMAIL_REDIRECT_TO_MOBILE?.trim() ||
    "enigma://auth/confirm";
  const emailRedirectTo = preferDirectOtp
    ? mobileRedirectTo
    : process.env.NEXT_PUBLIC_AUTH_EMAIL_REDIRECT_TO?.trim() ||
      `${getRedirectSiteOrigin()}/auth/confirm`;
  console.log("[auth] magic_link:redirect_config", {
    mode: preferDirectOtp ? "direct_supabase" : "api_route",
    email: label,
    emailRedirectTo,
    siteOrigin: getSiteOrigin(),
    runtimeOrigin: typeof window !== "undefined" ? window.location.origin : "",
  });
  if (preferDirectOtp) {
    console.log("[mobile-auth] otp_send_config", {
      email: label,
      emailRedirectTo,
      runtimeOrigin: typeof window !== "undefined" ? window.location.origin : "",
    });
  }

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = setTimeout(() => controller?.abort(), 15_000);

  const signInDirectSupabase = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: true,
          emailRedirectTo,
        },
      });
      if (error) {
        const status = Number((error as { status?: unknown; code?: unknown }).status ?? 0);
        console.error("[mobile-otp] send_error", {
          email: label,
          status,
          message: error.message ?? "otp_failed",
        });
        console.error("[auth] magic_link:response_error", {
          mode: "direct_supabase",
          email: label,
          status,
          message: error.message ?? "otp_failed",
        });
        return { error: { message: error.message || "Не удалось отправить код" } };
      }
      console.log("[auth] magic_link:response_ok", {
        mode: "direct_supabase",
        email: label,
        hasUser: Boolean(data?.user?.id),
      });
      console.log("[mobile-otp] send_ok", {
        email: label,
        hasUser: Boolean(data?.user?.id),
      });
      return { error: null as null };
    } catch (e) {
      const message = e instanceof Error ? e.message : "unexpected_error";
      console.error("[auth] magic_link:request_failed", {
        mode: "direct_supabase",
        email: label,
        message,
      });
      return { error: { message: "Не удалось отправить код. Проверьте интернет и повторите." } };
    }
  };

  if (preferDirectOtp) {
    clearTimeout(t);
    return signInDirectSupabase();
  }

  try {
    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed, emailRedirectTo }),
      signal: controller?.signal,
    });

    const raw = await res.text();
    if (res.ok) {
      console.log("[auth] magic_link:response_ok", {
        mode: "api_route",
        email: label,
        status: res.status,
      });
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

    console.warn("[auth] magic_link:response_error", {
      email: label,
      mode: "api_route",
      status: res.status,
      message,
    });

    if (res.status === 404 || res.status >= 500) {
      console.warn("[auth] magic_link:fallback_to_direct_supabase", {
        email: label,
        apiStatus: res.status,
      });
      return signInDirectSupabase();
    }
    return { error: { message } };
  } catch (e) {
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "Превышено время ожидания. Проверьте интернет и повторите."
        : "Не удалось отправить код. Проверьте интернет и повторите.";
    console.error("[auth] magic_link:request_failed", {
      email: label,
      mode: "api_route",
      message: msg,
    });
    console.warn("[auth] magic_link:fallback_to_direct_supabase", {
      email: label,
      reason: "api_fetch_failed",
    });
    return signInDirectSupabase();
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
