import { supabase } from "./supabase";
import { getSiteOrigin } from "./runtimeConfig";

/**
 * Magic link only — шаблон письма в Supabase: ссылка, не OTP.
 * Redirect URLs: production origin, /auth/callback, и при необходимости exp://…
 */
export async function signIn(email: string) {
  const trimmed = email.trim().toLowerCase();
  const emailRedirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : `${getSiteOrigin()}/auth/callback`;

  return supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
    },
  });
}

export async function signInWithMagicLink(email: string) {
  return signIn(email);
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}
