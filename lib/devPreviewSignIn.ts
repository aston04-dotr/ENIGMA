import { supabase } from "./supabase";

/** Только в dev-сборке: вход без SMS. */
export const isDevPreviewSignInAvailable =
  typeof __DEV__ !== "undefined" && __DEV__;

const DEV_EMAIL = process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL?.trim() ?? "";
const DEV_PASSWORD = process.env.EXPO_PUBLIC_DEV_LOGIN_PASSWORD ?? "";

function formatDevErrors(parts: string[]): string {
  const hint =
    "\n\n— Включите Anonymous: Authentication → Providers → Anonymous.\n" +
    "— Либо в .env задайте EXPO_PUBLIC_DEV_LOGIN_EMAIL и EXPO_PUBLIC_DEV_LOGIN_PASSWORD " +
    "(создайте пользователя с Email в Supabase; для теста отключите «Confirm email»).\n" +
    "— Если ошибка про ключ API: в Settings → API скопируйте legacy «anon» JWT (eyJ…), не только publishable.\n" +
    "— PGRST205 / «таблица не найдена»: выполните файл supabase/schema.sql в SQL Editor.";
  return parts.filter(Boolean).join("\n→ ") + hint;
}

export async function signInDevPreviewWithoutSms(): Promise<{ userId: string } | { error: string }> {
  await supabase.auth.signOut({ scope: "local" });

  const errors: string[] = [];

  const anon = await supabase.auth.signInAnonymously();
  if (!anon.error && anon.data.session?.user?.id) {
    return { userId: anon.data.session.user.id };
  }
  errors.push(anon.error?.message ? `Anonymous: ${anon.error.message}` : "Anonymous: нет сессии");

  if (DEV_EMAIL && DEV_PASSWORD) {
    const pw = await supabase.auth.signInWithPassword({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    });
    if (!pw.error && pw.data.session?.user?.id) {
      return { userId: pw.data.session.user.id };
    }
    errors.push(pw.error?.message ? `Email: ${pw.error.message}` : "Email: нет сессии");
  }

  return { error: formatDevErrors(errors) };
}
